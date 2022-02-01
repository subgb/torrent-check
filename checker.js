#!/usr/bin/env node

const Torrent = require('./torrent');
const argv = require('yargs')
	.alias('h', 'help')
	.demandCommand(1, 'Needs a .torrent file!')
	.string('_')
	.option('d', {
		alias: 'dir',
		string: true,
		requiresArg: true,
	})
	.option('e', {
		alias: 'encoding',
		string: true,
		requiresArg: true,
	})
	.option('w', {
		alias: 'width',
		number: true,
		default: 50,
		desc: 'graph width',
	})
	.argv;

startup();
async function startup() {
	const torrent = new Torrent(argv._[0], argv.e);
	if (argv.d) {
		const ret = await torrent.checkFilesGraph(argv.d, argv.w);
	}
	else {
		console.log(torrent.meta);
	}
}
