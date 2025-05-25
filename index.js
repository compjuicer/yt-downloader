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
        const process = spawn('yt-dlp', args);

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
                console.log(output);
                resolve();
            } else {
                console.error(error);
                reject();
            }
        });
    });
}

const entries = await getEntries({ title: 'music' });

for (const entry of entries) {
    try {
        const { id, title, url } = entry;
        console.log(title);
        await download(url);
        await markAsRead(id);
    } catch (err) {
    }
}
