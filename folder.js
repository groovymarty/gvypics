var mydbx = require("./mydbx.js");
var pic = require("./pic.js");
var File = require("./file.js");

var freshMs = 30*1000;       //update is fresh for 30 sec
var staleMs = 6*60*60*1000;  //update is stale after 6 hrs

function Folder(parent, meta, parts) {
  this.parent = parent;
  this.name = meta.name;
  this.path = meta.path_lower;
  this.id = parts.id;
  this.folders = {};
  this.pictures = {};
  this.videos = {};
  //console.log("Folder "+this.id+" created");
}

Folder.prototype.update = function(recursive) {
  var self = this;
  var idsSeen = {};
  
  function processListFolderResult(result) {
    result.entries.forEach(function(entry) {
      var parts;
      if (entry['.tag'] === "folder") {
        parts = pic.parseFolder(entry.name);
        if (parts) {
          if (idsSeen[parts.id]) {
            console.log("***** Dup folder: "+entry.name+" ignored, keeping: "+self.folders[parts.id].name);
          }
          idsSeen[parts.id] = true;
          if (!(parts.id in self.folders)) {
            self.folders[parts.id] = new Folder(self, entry, parts);
          }
        } else {
          //console.log("Skipping " + entry.name);
        }
      } else if (entry['.tag'] === "file") {
        parts = pic.parseFile(entry.name);
        if (parts) {
          if (parts.type === "") {
            if (idsSeen[parts.id]) {
              console.log("***** Dup picture: "+entry.name+" ignored, keeping: "+self.pictures[parts.id].name);
            }
            idsSeen[parts.id] = true;
            if (!(parts.id in self.pictures)) {
              self.pictures[parts.id] = new File(self, entry, parts);
            }
          } else if (parts.type === "V") {
            if (idsSeen[parts.id]) {
              console.log("***** Dup video "+entry.name+" ignored, keeping: "+self.videos[parts.id].name);
            }
            idsSeen[parts.id] = true;
            if (!(parts.id in self.videos)) {
              self.videos[parts.id] = new File(self, entry, parts);
            }
          } else {
            console.log("**** Ignoring "+entry.name+", unknown type "+parts.type);
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
      var notSeen = Object.keys(self.pictures).filter(function(id) {return !(id in idsSeen);});
      notSeen.forEach(function(id) {
        console.log("Picture "+id+" deleted");
        delete self.pictures[id];
      });
      notSeen = Object.keys(self.videos).filter(function(id) {return !(id in idsSeen);});
      notSeen.forEach(function(id) {
        console.log("Video "+id+" deleted");
        delete self.videos[id];
      });
      notSeen = Object.keys(self.folders).filter(function(id) {return !(id in idsSeen);});
      notSeen.forEach(function(id) {
        console.log("Folder "+id+" deleted");
        delete self.folders[id];
      });
      // set last update time
      self.lastUpdate = Date.now();
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

// Update folder if it's been awhile since it was last updated
Folder.prototype.possibleUpdate = function() {
  if (!this.lastUpdate || (Date.now() - this.lastUpdate) > staleMs) {
    // never updated or last update is stale
    return this.update();
  } else {
    // no update needed
    return Promise.resolve(true);
  }
};

// Ensure folder is freshly updated
Folder.prototype.freshUpdate = function() {
  if (!this.lastUpdate || (Date.now() - this.lastUpdate) > freshMs) {
    // ne er updated or not freshly updated
    return this.update();
  } else {
    // no update needed
    return Promise.resolve(true);
  }
};

Folder.prototype.represent = function() {
  var self = this;
  return {
    name: this.name,
    id: this.id,
    folders: Object.keys(this.folders).sort(),
    pictures: Object.keys(this.pictures).sort(function(id1, id2) {
      return self.pictures[id1].num - self.pictures[id2].num;
    }),
    videos: Object.keys(this.videos).sort(function(id1, id2) {
      return self.videos[id1].num - self.videos[id2].num;
    })
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
    numFolders: Object.keys(this.folders).length,
    numPictures: Object.keys(this.pictures).length,
    numVideos: Object.keys(this.videos).length
  };
  if (recursive) {
    return Object.keys(this.folders).reduce(function(accum, id) {
      var subCount = self.folders[id].count(true);
      accum.numFolders += subCount.numFolders;
      accum.numPictures += subCount.numPictures;
      accum.numVideos += subCount.numVideos;
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
    return this.freshUpdate().then(function() {
      return self.findFolder(folderName, childString, false);
    });
  } else {
    // folder still not found after updating, give up
    return Promise.reject(new Error("Folder not found: "+folderName+" in "+this.id));
  }
};

Folder.prototype.findFile = function(id, type, tryUpdate) {
  var self = this;
  var file = null;
  if (type === "") {
    file = this.pictures[id];
  } else if (type === "V") {
    file = this.videos[id];
  } else {
    return Promise.reject(new Error("Unknown type "+type));
  }
  if (file) {
    return Promise.resolve(file);
  } else if (tryUpdate) {
    // file not found, update and try again
    return this.freshUpdate().then(function() {
      return self.findFile(id, type, false);
    });
  } else {
    // file still not found after updating, giv up
    return Promise.reject(new Error("File not found: "+id+" in "+this.id));
  }
};

module.exports = Folder;
