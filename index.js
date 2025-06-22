import fs from 'fs';
import { spawn } from 'child_process';
import _ from 'lodash';
import { MinifluxClient } from './miniflux-js-patched.js';

const config = JSON.parse(fs.readFileSync('./config.json'));
const client = new MinifluxClient(config);

async function getEntries(filter) {
    const categories = await client.getCategories();
    const category = _.find(categories, filter);
    const { entries } = await client.getCategoryEntries(category.id, { status: 'unread' });

    return entries;
}

async function markAsRead(id) {
    await client.updateEntryStatus(id, 'read');
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

const entries = await getEntries({ title: 'music' });

for (const entry of entries) {
    const { id, title, url } = entry;
    let error;

    try {
        await download(url);
        await markAsRead(id);
    } catch (e) {
	error = e;
    }

     if (!error
        || error.match(/Premieres in /)
        || error.match(/Requested format is not available./)
        || error.match(/Private video./)
        || error.match(/Video unavailable./)) {
        await markAsRead(id);
    } else {
        console.log(`error downloading: ${title}`);
        console.log(error);
    }
}
