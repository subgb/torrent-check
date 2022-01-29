const {EventEmitter} = require('events');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const assert = require('assert');
const bncode = require('bncode');
const iconv = require('iconv-lite');
const chalk = require('chalk');
const HEXKEYS = new Set(['md5sum', 'ed2k', 'filehash', 'zzsign', 'pieces']);


module.exports = class Torrent extends EventEmitter {
	constructor(file, encoding) {
		super();
		const buf = fs.readFileSync(file);
		this.rawMeta = bncode.decode(buf);
		encoding = encoding || this.rawMeta.encoding || 'utf8';
		this.meta = this.parseMeta(this.rawMeta, encoding);
		this.meta.magnet = `magnet:?xt=urn:btih:${this.infoHash}`;
		this.meta.torrent = file;
		this.validateSchema();
	}

	get file() {
		return this.meta.torrent;
	}

	get infoHash() {
		return sha1sum(bncode.encode(this.rawMeta.info), true).toUpperCase();
	}

	parseMeta({info, ...raw}, encoding) {
		const meta = Object.assign({}, raw, info);
		stringifyMeta(meta, encoding);
		convert('piece length', 'pieceSize');
		convert('pieces', 'pieceCount', x=>x.length/20);
		convert('creation date', null, x=>new Date(x*1000));

		meta.files = meta.files || [{ length: meta.length, path: [meta.name] }];
		meta.fileCount = meta.files.length;
		meta.filesTotalSize = 0;
		delete meta.length;
		for (const file of meta.files) {
			meta.filesTotalSize += file.length;
			file.path = file.path.join('/');
		}
		return meta;

		function convert(key, newkey, fn = x=>x) {
			if (!(key in meta)) return;
			if (newkey==null) newkey=key;
			meta[newkey] = fn(meta[key]);
			if (newkey!=key) delete meta[key];
		}
	}

	validateSchema() {
		const meta = this.meta;
		const pieces = this.rawMeta.info.pieces;
		assert.ok(Number.isInteger(meta.pieceSize), 'wrong piece size');
		assert.ok(meta.pieceSize>0, 'wrong piece size');
		assert.ok(Buffer.isBuffer(pieces), 'wrong pieces type');
		assert.ok(pieces.length>0, 'empty piece hash');
		assert.ok(meta.fileCount>0, 'no any file info');
		assert.equal(pieces.length%20, 0, 'wrong pieces length');
		assert.equal(Math.ceil(meta.filesTotalSize/meta.pieceSize), meta.pieceCount, 'files totle size is not match the piece count');
		for (const file of meta.files) {
			assert.ok(Number.isInteger(file.length), 'wrong file size');
			assert.ok(file.length>=0, 'wrong file size');
			assert.ok(file.path.length>0, 'wrong file path');
		}
	}

	async checkFiles(folder, stopOnError=true) {
		if (!fs.existsSync(folder)) throw new Error(`folder not exists: ${folder}`);
		const meta = this.meta;
		const pieces = this.rawMeta.info.pieces;
		const files = JSON.parse(JSON.stringify(meta.files));
		const buffer = Buffer.alloc(meta.pieceSize);
		let graph = Buffer.alloc(meta.pieceCount).fill('*');
		let totalSize = 0;
		let matchedPieces = 0;

		for (const file of files) {
			const fullpath = path.join(folder, file.path);
			const isLastFile = totalSize+file.length === meta.filesTotalSize;
			let pieceIndex = Math.floor(totalSize/meta.pieceSize);
			this.emit('file:open', file);
			try {
				let piece, readSize;
				for await ({piece, readSize} of readPiece(fullpath, buffer, totalSize%meta.pieceSize)) try {
					if (readSize > file.length) throw new Error('file larger than expected');
					if (piece.length!==meta.pieceSize && !isLastFile) continue;
					const pieceHash = pieces.slice(pieceIndex*20, ++pieceIndex*20);
					const matched = sha1sum(piece).equals(pieceHash);
					const progress = 100*pieceIndex/meta.pieceCount;
					this.emit('file:piece', {...file, progress, matched, pieceHash, pieceIndex});
					if (!matched) throw new Error('piece hash mismatch');
					matchedPieces++;
					graph.write('.', pieceIndex-1);
				}
				catch(e) {
					file.error = e.message;
					if (stopOnError) throw e;
				}
				if (!file.error && readSize<file.length) throw new Error('file smaller than expected');
			}
			catch(e) {
				file.error = e.message;
				if (stopOnError) throw e;
			}
			finally {
				totalSize += file.length;
				this.emit('file:close', file);
			}
		}

		let index=0, offset=0, ok=true;;
		graph = graph.toString();
		for (const file of files) {
			const count = (offset+=file.length) / meta.pieceSize;
			file.graph = graph.slice(index, index+Math.ceil(count));
			file.integrity = +(100 * (file.graph.match(/\./g)||[]).length / file.graph.length).toFixed(2);
			if (!file.error && /\*/.test(file.graph)) {
				file.error = 'last piece hash mismatch';
				if (stopOnError) throw new Error(file.error);
			}
			file.ok = !file.error;
			ok = ok && file.ok;
			index += Math.floor(count);
			offset %= meta.pieceSize;
		}

		assert.equal((graph.match(/\./g)||[]).length, matchedPieces, 'matched piece count not equals');
		const integrity = 100 * matchedPieces / meta.pieceCount;
		const result = {ok, integrity, files}
		this.emit('end', result);
		return result;
	}

	async checkFilesGraph(folder, width=50) {
		let cursorOffset = -1;
		if (width<50) width=50;
		console.log(chalk.cyan('[torrent]'), this.file);
		console.log(chalk.cyan('[folder ]'), folder);
		const fileOpen = f => {
			const size = f.length.toLocaleString().padStart(15);
			console.log(`${size} bytes; ${chalk.blue(f.path)}`);
			cursorOffset = -1;
		};
		const filePiece = ({progress, matched}) => {
			if (++cursorOffset >= width) {
				cursorOffset = 0;
				process.stdout.write('\x1b[K\n');
			}
			const sign = matched===true? '.': matched===false? '*': '_';
			const prog = progress.toFixed(1).padStart(4);
			process.stdout.write(`${sign}\x1b[s\x1b[${width+5}G${prog}%\x1b[u`);
		};
		const fileClose = f => {
			process.stdout.write('\x1b[K\n');
		};
		const checkEnd = ({integrity, files}) => {
			console.log();
			for (const file of files) {
				const result = file.ok? '  OK ': file.integrity.toFixed(2).padStart(5);
				const color = file.ok? chalk.green: chalk.magenta;
				console.log(color(`[${result}]`), file.path, chalk.red(file.error||''));
			}
			console.log(chalk.cyan('All Files Integrity:'), integrity.toFixed(2), '%\n');
		};
		this.on('file:open', fileOpen);
		this.on('file:piece', filePiece);
		this.on('file:close', fileClose);
		this.on('end', checkEnd);
		return this.checkFiles(folder, false).finally(() => {
			this.off('file:open', fileOpen);
			this.off('file:piece', filePiece);
			this.off('file:close', fileClose);
			this.off('end', checkEnd);
		});
	}
}

function sha1sum(buffer, hex) {
	return crypto.createHash('sha1').update(buffer).digest(hex? 'hex': null);
}

function stringifyMeta(meta, encoding='utf8') {
	Object.keys(meta).forEach(key => {
		if (key=='pieces') return;
		const value = meta[key];
		let enc = encoding;
		if (key.endsWith('.utf-8')) {
			delete meta[key];
			key = key.slice(0, -6);
			meta[key] = value;
			enc = 'utf8';
		}
		if (Buffer.isBuffer(value)) {
			if (HEXKEYS.has(key)) enc='hex';
			meta[key] = iconv.decode(value, enc);
		}
		else if (typeof value === 'object') {
			stringifyMeta(value, enc);
		}
	});
	return meta;
}

async function* readPiece(file, buffer, offset) {
	const bufSize = buffer.length;
	let readSize = 0;
	let eof = false;
	let fh;
	try {
		fh = await fsp.open(file, 'r');
		while(!eof) {
			const {bytesRead} = await fh.read(buffer, offset, bufSize-offset, readSize);
			readSize += bytesRead;
			offset += bytesRead;
			eof = offset<bufSize;
			if (!eof) offset=0;
			if (!bytesRead) break;
			const piece = offset? buffer.slice(0, offset): buffer;
			yield {piece, readSize};
		}
	}
	finally {
		if (fh) await fh.close();
	}
}
