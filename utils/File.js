const fs = require('fs');

class File {
  constructor(path) {
    this.path = path;
    this.content = null;
  }

  read() {
    this.content = fs.readFileSync(this.path, { encoding: 'utf-8' });
    return this.content;
  }

  write(data, isJSON) {
    this.content = data;
    fs.writeFileSync(
      this.path,
      isJSON ? JSON.stringify(this.content) : this.content
    );
  }
}

module.exports = File;
