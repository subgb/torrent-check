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
	.option('x', {
		alias: 'ext',
		string: true,
		desc: 'try append extname if file not exists, e.g. ".\\!ut"',
		coerce(arg) {
			if (Array.isArray(arg)) arg=arg.find(x=>x);
			if (!arg) return null;
			if (typeof arg=='object') arg=Object.keys(arg)[0];
			arg=arg.replace(/\\/g, '');
			if (!arg) return null;
			if (!arg.startsWith('.')) arg='.'+arg;
			return arg;
		},
	})
	.argv;

startup();
async function startup() {
	const torrent = new Torrent(argv._[0], argv.e);
	if (argv.d) {
		if (argv.x) torrent.ext = argv.x;
		const ret = await torrent.checkFilesGraph(argv.d, argv.w);
	}
	else {
		console.log(torrent.meta);
	}
}
