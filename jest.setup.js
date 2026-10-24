jest.mock('expo-file-system', () => {
  let mockFiles = {};

  const File = class File {
    constructor(pathOrDir, name) {
      // expo-file-system's File accepts either a single URI string or a
      // (directory, name) pair; keep both working so the recording tests can
      // open a log by its absolute URI.
      if (name === undefined) {
        this.uri = pathOrDir;
        this.name = pathOrDir.split('/').filter(Boolean).pop();
      } else {
        const basePath = typeof pathOrDir === 'string' ? pathOrDir : pathOrDir.uri;
        this.uri = `${basePath}${name}`;
        this.name = name;
      }
    }

    open() {
      return new FileHandle(this);
    }

    get exists() {
      return !!mockFiles[this.uri];
    }

    async text() {
      if (this.exists) {
        const val = mockFiles[this.uri];
        return val instanceof Uint8Array ? new TextDecoder().decode(val) : val;
      }
      throw new Error(`File not found: ${this.uri}`);
    }

    async bytes() {
      if (this.exists) {
        const val = mockFiles[this.uri];
        return val instanceof Uint8Array ? val : new TextEncoder().encode(String(val));
      }
      throw new Error(`File not found: ${this.uri}`);
    }

    write(content, options) {
      mockFiles[this.uri] = content;
    }

    writeBytes(content) {
      mockFiles[this.uri] = content;
    }

    delete() {
      delete mockFiles[this.uri];
    }
  };

  const FileHandle = class FileHandle {
    constructor(file) {
      this.file = file;
      this.offset = 0;
      this._bytes = null;
    }

    get bytes() {
      if (this._bytes) {
        return this._bytes;
      }
      const val = mockFiles[this.file.uri];
      this._bytes = val instanceof Uint8Array ? val : new TextEncoder().encode(String(val));
      return this._bytes;
    }

    get size() {
      return this.bytes.length;
    }

    readBytes(length) {
      const bytes = this.bytes;
      const start = this.offset;
      const end = Math.min(start + length, bytes.length);
      const chunk = bytes.slice(start, end);
      this.offset = end;
      return chunk;
    }

    close() {
      // no-op
    }

    writeBytes(bytes) {
      const prev = mockFiles[this.file.uri];
      const prevBytes = prev instanceof Uint8Array
        ? prev
        : new TextEncoder().encode(String(prev ?? ''));
      const next = new Uint8Array(prevBytes.length + bytes.length);
      next.set(prevBytes);
      next.set(bytes, prevBytes.length);
      mockFiles[this.file.uri] = next;
      this._bytes = next;
    }
  };

  return {
    Paths: {
      document: 'file:///var/mobile/Containers/Data/Application/mock-uuid/Documents/',
      cache: 'file:///var/mobile/Containers/Data/Application/mock-uuid/Library/Caches/'
    },
    File,
    FileHandle,
    Directory: class Directory {
      constructor(path, name) {
        const basePath = typeof path === 'string' ? path : path.uri;
        this.uri = name ? `${basePath}${name}/` : basePath;
        this.name = name;
      }

      get exists() {
        return true;
      }

      create() {
        // no-op
      }

      list() {
        const filesInDir = Object.keys(mockFiles)
          .filter(uri => uri.startsWith(this.uri))
          .map(uri => {
            const name = uri.substring(this.uri.length);
            return new File(this, name);
          });
        return filesInDir;
      }
    },
    __setMockFiles: newMockFiles => {
      mockFiles = newMockFiles;
    },
    __clearMockFiles: () => {
      mockFiles = {};
    }
  };
});
