# torrent-check

### Torrent file checker: verify files and print graph.

## Install
```bash
npm install torrent-check 
```

## Usage

### Command Line
```bash
# show help
torrent-check -h

# show .torrent info
torrent-check movie-collection.torrent

# verify files and print graph
torrent-check movie-collection.torrent -d /path/to/movies-dir

# graph width 80; try append .!ut ext name if file not exists
torrent-check movie-collection.torrent -d /path/to/movies-dir -w 80 -e utf8 -x \!ut
```

### Node Module
```js
const Torrent = require('torrent-check');

const torrent = new Torrent('path/to/myfile.torrent', 'utf8');
console.log(torrent.infoHash);
console.log(torrent.meta);

// torrent.ext = '.!ut';
// torrent.on('end', function callback() {});
(async () => {
    const ret = await torrent.checkFiles('path/to/myfiles/folder', false);
    console.log(ret);
    
    // or show graph
    await torrent.checkFilesGraph('path/to/myfiles/folder', 80);
})();
```

## API

### Constructor
* new Torrent(torrentFile, encoding)

### Instance Method
* async checkFiles(folder, stopOnError = true)
* async checkFilesGraph(folder, width = 50)

### Instance Property
* meta
* rawMeta
* infoHash
* file
* ext

### Events
* file:open
* file:piece
* file:close
* end

