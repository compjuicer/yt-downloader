import fs from 'fs';
import { spawn } from 'child_process';

const config = JSON.parse(fs.readFileSync('./config.json'));
const api = `${config.baseURL}/api/greader.php`;
const READ = 'user/-/state/com.google/read';

async function login() {
    const response = await fetch(`${api}/accounts/ClientLogin`, {
        method: 'POST',
        body: new URLSearchParams({ Email: config.user, Passwd: config.apiPassword }),
    });
    const body = await response.text();
    const auth = body.match(/^Auth=(.+)$/m);
    if (!response.ok || !auth) {
        throw new Error(`login failed: ${response.status} ${body.trim()}`);
    }

    return { Authorization: `GoogleLogin auth=${auth[1]}` };
}

async function getEntries(headers, category) {
    const entries = [];
    let continuation;

    do {
        const params = new URLSearchParams({ xt: READ, n: 1000 });
        if (continuation) params.set('c', continuation);
        const response = await fetch(`${api}/reader/api/0/stream/contents/user/-/label/${encodeURIComponent(category)}?${params}`, { headers });
        if (!response.ok) {
            throw new Error(`fetching entries failed: ${response.status}`);
        }
        const data = await response.json();
        for (const item of data.items) {
            entries.push({ id: item.id, title: item.title, url: (item.canonical ?? item.alternate)?.[0]?.href });
        }
        continuation = data.continuation;
    } while (continuation);

    return entries;
}

async function markAsRead(headers, id) {
    const token = await (await fetch(`${api}/reader/api/0/token`, { headers })).text();
    const response = await fetch(`${api}/reader/api/0/edit-tag`, {
        method: 'POST',
        headers,
        body: new URLSearchParams({ i: id, a: READ, T: token.trim() }),
    });
    if (!response.ok) {
        throw new Error(`marking ${id} as read failed: ${response.status}`);
    }
}

async function download(url) {
    const args = [
        // '-s',
        '-o', config.format,
        '-x',
        '-f', 'm4a',
        url
    ];

    return new Promise((resolve, reject) => {
        const process = spawn(`${config.ytDlpPath}/yt-dlp`, args);

        let output = '';
        let error = '';

        process.stdout.on('data', (data) => {
            output += data.toString();
        });

        process.stderr.on('data', (data) => {
            error += data.toString();
        });

        process.on('close', (code) => {
            if (code === 0) {
                resolve(output);
            } else {
                reject(error);
            }
        });
    });
}

const headers = await login();
const entries = await getEntries(headers, 'music');

if (process.argv.includes('--list')) {
    for (const { title, url } of entries) {
        console.log(`${url}  ${title}`);
    }
    process.exit(0);
}

for (const entry of entries) {
    const { id, title, url } = entry;
    let error;

    try {
        await download(url);
    } catch (e) {
	error = e;
    }

    if (!error
        //|| error.match(/Premieres in /)
        || error.match(/Requested format is not available./)
        || error.match(/Private video./)
        || error.match(/Video unavailable./)) {
        await markAsRead(headers, id);
    } else {
        console.log(`error downloading: ${title}`);
        console.log(error);
    }
}
