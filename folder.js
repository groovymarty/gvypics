var mydbx = require("./mydbx.js");
var pic = require("./pic.js");
var File = require("./file.js");

function Folder(parent, meta, parts) {
  this.parent = parent;
  this.name = meta.name;
  this.path = meta.path_lower;
  this.id = parts.id;
  this.folders = {};
  this.files = {};
  //console.log("Folder "+this.id+" created");
}

Folder.prototype.update = function(recursive) {
  var self = this;
  var filesSeen = {};
  var foldersSeen = {};
  
  function processListFolderResult(result) {
    result.entries.forEach(function(entry) {
      var parts;
      if (entry['.tag'] === "folder") {
        parts = pic.parseFolder(entry.name);
        if (parts) {
          if (foldersSeen[parts.id]) {
            console.log("***** Dup folder: "+entry.name+" ignored, keeping: "+self.folders[parts.id].name);
          }
          foldersSeen[parts.id] = true;
          if (!(parts.id in self.folders)) {
            self.folders[parts.id] = new Folder(self, entry, parts);
          }
        } else {
          //console.log("Skipping " + entry.name);
        }
      } else if (entry['.tag'] === "file") {
        parts = pic.parseFile(entry.name);
        if (parts) {
          if (filesSeen[parts.id]) {
            console.log("***** Dup file: "+entry.name+" ignored, keeping: "+self.files[parts.id].name);
          }
          filesSeen[parts.id] = true;
          if (!(parts.id in self.files)) {
            self.files[parts.id] = new File(self, entry, parts);
          }
        } else {
          //console.log("Skipping " + entry.name);
        }
      } else {
        console.log("Unknown .tag: "+entry['.tag']);
      }
    });
    if (result.has_more) {
      // return another promise to keep chain going
      return mydbx.fileListFolderContinue({cursor: result.cursor})
        .then(processListFolderResult)
        .catch(function(error) {
          console.log(error);
        });
    }
    return true; //done
  }

  return mydbx.filesListFolder({path: this.path})
    .then(processListFolderResult)
    .then(function() {
      // clean up deleted files and folders
      var filesNotSeen = Object.keys(self.files).filter(function(id) {return !(id in filesSeen);});
      filesNotSeen.forEach(function(id) {
        console.log("File "+id+" deleted");
        delete self.files[id];
      });
      var foldersNotSeen = Object.keys(self.folders).filter(function(id) {return !(id in foldersSeen);});
      foldersNotSeen.forEach(function(id) {
        console.log("Folder "+id+" deleted");
        delete self.folders[id];
      });
      if (recursive) {
        return Promise.all(Object.keys(self.folders).map(function(id) {
          return self.folders[id].update(true);
        }));
      } else {
        // not recursive
        return true; //done
      }
    })
    .catch(function(error) {
      console.log(error);
    });
};

Folder.prototype.possibleUpdate = function() {
  if (this.isEmpty()) {
    return this.update();
  } else {
    // no update needed
    return Promise.resolve(true);
  }
};

Folder.prototype.represent = function() {
  return {
    name: this.name,
    id: this.id,
    folders: Object.keys(this.folders).sort(),
    files: Object.keys(this.files)
  };
};

Folder.prototype.isEmpty = function() {
  var f;
  for (f in this.files) {
    return false;
  }
  return true;
};

Folder.prototype.count = function(recursive) {
  var self = this;
  var myCount = {
    numFiles: Object.keys(this.files).length,
    numFolders: Object.keys(this.folders).length
  };
  if (recursive) {
    return Object.keys(this.folders).reduce(function(accum, id) {
      var subCount = self.folders[id].count(true);
      accum.numFiles += subCount.numFiles;
      accum.numFolders += subCount.numFolders;
      return accum;
    }, myCount);
  } else {
    // not recursive
    return myCount;
  }
};

// Find folder with specified name, possibly drilling down to child folders
Folder.prototype.findFolder = function(folderName, childString, tryUpdate) {
  var self = this;
  var folder = this.folders[folderName];
  if (folder) {
    // folder found, are we at end of child string?
    if (childString) {
      // no, split string at next plus sign after first char
      // if first char is plus, don't split there
      var iplus = childString.substr(1).indexOf("+");
      if (iplus < 0) {
        // no more plus signs, use entire string
        iplus = childString.length;
      } else {
        // fix index to account for substr(1) above
        iplus += 1;
      }
      // find next child
      return folder.findFolder(folderName + childString.substr(0,iplus), childString.substr(iplus), true);
    } else {
      // no more children, we're done
      return Promise.resolve(folder);
    }
  } else if (tryUpdate) {
    // folder not found, update and try again
    return this.update().then(function() {
      return self.findFolder(folderName, childString, false);
    });
  } else {
    // folder still not found after updating, give up
    return Promise.reject(new Error("Folder not found: "+folderName+" in "+this.id));
  }
};

module.exports = Folder;
