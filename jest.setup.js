jest.mock('expo-file-system', () => {
  let mockFiles = {};

  const File = class File {
    constructor(pathOrDir, name) {
      const basePath = typeof pathOrDir === 'string' ? pathOrDir : pathOrDir.uri;
      this.uri = `${basePath}${name}`;
      this.name = name;
    }

    get exists() {
      return !!mockFiles[this.uri];
    }

    async text() {
      if (this.exists) {
        return mockFiles[this.uri];
      }
      throw new Error(`File not found: ${this.uri}`);
    }

    write(content, options) {
      mockFiles[this.uri] = content;
    }

    delete() {
      delete mockFiles[this.uri];
    }
  };

  return {
    Paths: {
      document: 'file:///var/mobile/Containers/Data/Application/mock-uuid/Documents/',
      cache: 'file:///var/mobile/Containers/Data/Application/mock-uuid/Library/Caches/',
    },
    File,
    Directory: class Directory {
      constructor(path, name) {
        this.uri = `${path}${name}/`;
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
    __setMockFiles: (newMockFiles) => {
      mockFiles = newMockFiles;
    },
    __clearMockFiles: () => {
      mockFiles = {};
    }
  };
});