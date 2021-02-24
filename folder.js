var mydbx = require("./mydbx.js");
var pic = require("./pic.js");
var File = require("./file.js");
var finder = require("./finder.js");
var metaChg = require("./metachg.js");

var freshMs = 30*1000;       //update is fresh for 30 sec
var staleMs = 6*60*60*1000;  //update is stale after 6 hrs

function Folder(parent, dbxmeta, parts) {
  this.parent = parent;
  this.name = dbxmeta.name;
  this.path = dbxmeta.path_lower;
  this.id = parts.id;
  this.num = parts.num;
  this.folders = {};
  this.pictures = {};
  this.videos = {};
  // lastUpdate, added by update()
  // contents and/or meta, added by update() if corresponding json files are present
  //console.log("Folder "+this.id+" created");
}

Folder.prototype.isRootFolder = function() {
  return this.parent === null;
};

Folder.prototype.updateProperties = function(dbxmeta) {
  this.name = dbxmeta.name;
  this.path = dbxmeta.path_lower;
};

Folder.prototype.update = function(recursive) {
  var self = this;
  var idsSeen = {};
  
  // skip if alt folder
  if (this.isAltFolder) {
    return Promise.resolve(this);
  }
  
  function processListFolderResult(result) {
    result.entries.forEach(function(entry) {
      var parts;
      if (entry['.tag'] === "folder") {
        parts = pic.parseFolder(entry.name);
        if (parts) {
          if (idsSeen[parts.id]) {
            console.log("***** Dup folder: "+entry.name+" ignored, keeping: "+self.folders[parts.id].name);
          } else {
            idsSeen[parts.id] = true;
            if (!(parts.id in self.folders)) {
              self.folders[parts.id] = new Folder(self, entry, parts);
            } else {
              self.folders[parts.id].updateProperties(entry);
            }
          }
        } else {
          //console.log("Skipping " + entry.name);
        }
      } else if (entry['.tag'] === "file") {
        parts = pic.parseFile(entry.name);
        if (parts) {
          var tinfo = File.typeInfo[parts.type];
          if (tinfo) {
            var mime = tinfo.extToMime[parts.ext];
            if (mime) {
              var container = self[tinfo.containerName];
              if (idsSeen[parts.id]) {
                console.log("***** Dup "+tinfo.name+": "+entry.name+" ignored, keeping: "+container[parts.id].name);
              } else {
                idsSeen[parts.id] = true;
                if (!(parts.id in container)) {
                  container[parts.id] = new File(self, entry, parts, mime);
                } else {
                  container[parts.id].updateProperties(entry, mime);
                }
              }
            } else if (parts.ext !== ".xpng") {
              console.log("**** Ignoring "+entry.name+", unknown ext "+parts.ext);
            }
          } else {
            console.log("**** Ignoring "+entry.name+", unknown type "+parts.type);
          }
        } else if (entry.name.toLowerCase() === "contents.json") {
          // note we use the folder's id for the contents.json and meta.json files
          if (!self.contents) {
            self.contents = new File(self, entry, {id: self.id, num: 0}, File.contentsMime);
          } else {
            self.contents.updateProperties(entry, File.contentsMime);
          }
        } else if (entry.name.toLowerCase() === "meta.json") {
          if (!self.meta) {
            self.meta = new File(self, entry, {id: self.id, num: 0}, File.metaMime);
          } else {
            self.meta.updateProperties(entry, File.metaMime);
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
      return mydbx.filesListFolderContinue({cursor: result.cursor})
        .then(processListFolderResult);
    }
    return true; //done
  }
  
  return mydbx.filesListFolder({path: this.path})
    .then(processListFolderResult)
    .then(function() {
      // clean up deleted files and folders
      File.containerNames.forEach(function(containerName) {
        var container = self[containerName];
        var notSeen = Object.keys(container).filter(function(id) {return !(id in idsSeen);});
        notSeen.forEach(function(id) {
          console.log(id+" deleted");
          var item = container[id];
          if (item.altParent) {
            // for example if you delete D17A, remove it from D17
            // this probably isn't necessary because we're about to rebuild the alt tree anyway
            delete item.altParent.folders[id];
          }
          delete container[id];
        });
      });
      // set last update time
      self.lastUpdate = Date.now();
      if (recursive) {
        // promise chain for sequential execution
        var chain = Promise.resolve(true);
        Object.keys(self.folders).forEach(function(id) {
          chain = chain.then(function() {
            return self.folders[id].update(true);
          });
        });
        return chain;
      } else {
        // not recursive
        return true; //done
      }
    })
    .then(function() {
      if (self.isRootFolder()) {
        self.altUpdate();
      }
      return self;
    })
    .catch(function(err) {
      console.log("error updating folder "+self.id+", path: "+self.path+": "+pic.getErrorMessage(err));
      throw err;
    });
};

// Return alt folder with specified id, creating if necessary
Folder.prototype.getAltFolder = function(id, name) {
  if (!this.altFolders) {
    this.altFolders = {};
  }
  var altFolder = this.altFolders[id];
  if (!altFolder) {
    altFolder = new Folder(this, {name: name || id}, {id: id, num: 0});
    altFolder.isAltFolder = true; //prevent updates
    altFolder.altParent = this;
    this.altFolders[id] = altFolder;
  }
  return altFolder;
};

// Add an item (always a regular folder) to this alt folder
Folder.prototype.addAltFolderItem = function(item) {
  this.folders[item.id] = item;
  item.altParent = this;
};

// Build the alt folder tree (root folder only)
Folder.prototype.altUpdate = function() {
  var self = this;
  // throw away old alt tree and build new one
  this.altFolders = {};
  Object.keys(this.folders).forEach(function(id) {
    var folder = self.folders[id];
    // get (or create) first-level alt folder based on first letter of id
    var altFolder = self.getAltFolder(id.substr(0, 1));
    var secondAltId = null;
    var secondAltName = null;
    // is this a special one?  Dnn and Ennn
    var mr = id.match(/^([DE])(\d+)/);
    if (mr) {
      switch (mr[1]) { //letter
        case "D":
          // Second level is letter followed by year digits
          // This is what the whole pattern matched so use mr[0]
          secondAltId = mr[0];
          break;
        case "E":
          // Find second level in table based on number ranges
          // If not found just add to first-level folder
          var num = parseInt(mr[2]);
          pic.eRanges.forEach(function(range) {
            if (!secondAltId && num >= range.start && num <= range.end) {
              secondAltId = range.id;
              secondAltName = range.name;
            }
          });
          break;
      }
    }
    if (secondAltId) {
      // get (or create) second-level alt folder and add item to it
      altFolder.getAltFolder(secondAltId, secondAltName).addAltFolderItem(folder);
    } else {
      // not special, add to first-level folder based on first letter
      altFolder.addAltFolderItem(folder);
    }
  });
  // make flat lookup map for alt folders
  this.altFolderMap = {};
  function addToAltMap(altFolders) {
    Object.keys(altFolders).forEach(function(id) {
      var folder = altFolders[id];
      self.altFolderMap[id] = folder;
      if (folder.altFolders) {
        addToAltMap(folder.altFolders);
      }
    });
  }
  addToAltMap(this.altFolders);
};

// Update folder if it's been awhile since it was last updated
Folder.prototype.possibleUpdate = function(limitMs) {
  if (!limitMs) {
    limitMs = staleMs;
  } else if (typeof limitMs === 'object') {
    if (limitMs.force) {
      limitMs = 0;
    } else if (limitMs.fresh) {
      limitMs = freshMs;
    } else {
      limitMs = staleMs;
    }
  }
  if (!this.lastUpdate || (Date.now() - this.lastUpdate) > limitMs) {
    // never updated or last update is too long ago
    return this.update();
  } else {
    // no update needed
    return Promise.resolve(this);
  }
};

// Ensure folder is freshly updated
Folder.prototype.freshUpdate = function() {
  return this.possibleUpdate(freshMs);
};

// Sort items in container by number then by id
// For root and alt folders all numbers are 0, so this gives sort by id
// All other folders contain pictures, videos or child folders with numbers
// If two pictures have same number (like D17M-1 and D17M-1A), sort by id will give right result
function getSortedContainerKeys(container) {
  return Object.keys(container).sort(function(id1, id2) {
    return (container[id1].num - container[id2].num) || id1.localeCompare(id2);
  });
}

// Return representation of folder
// Options: vo, video only
Folder.prototype.represent = function(options) {
  var options = options || {};
  var self = this;
  var myFolders;
  // get the folders we want to reveal
  if (this.isRootFolder()) {
    // for root we normally want to see the alt folders only
    // but if there aren't any, show the regular ones
    myFolders = this.altFolders || this.folders;
  } else if (this.altFolders) {
    // otherwise combine the regular and alt folders and show all of them
    // for example the alt folder for "D" contains alt folders like "D12" and regular ones like "DOC"
    myFolders = Object.assign({}, this.folders, this.altFolders);
  } else {
    // no alt folders so just show the regular ones
    myFolders = this.folders;
  }
  // get pictures array unless video only
  var myPictures = options.vo ? [] : this.pictures;
  // get videos array
  var myVideos = this.videos;
  // The root folder's name is "/", id is "", and parent is "0"
  // Note "0" is an illegal id value
  var rep = {
    name: this.name,
    id: this.id,
    parent: (this.altParent || this.parent || {id: "0"}).id,
    folders: getSortedContainerKeys(myFolders),
    pictures: getSortedContainerKeys(myPictures),
    videos: getSortedContainerKeys(myVideos)
  };
  // gather names of all items
  rep.names = {};
  [myFolders, myPictures, myVideos].forEach(function(container) {
    Object.keys(container).forEach(function(id) {
      rep.names[id] = container[id].name;
    });    
  });
  // add contents.json and meta.json, if they exist
  return Promise.all(['contents', 'meta'].map(function(whichFile) {
    if (self[whichFile]) {
      // folder has contents.json or meta.json file
      return self[whichFile].getJson().then(function(obj) {
        // if video only, filter metadata
        if (options.vo && whichFile === 'meta') {
          var filtMeta = {};
          Object.keys(obj).forEach(id => {
            if (id in myVideos) {
              filtMeta[id] = obj[id];
            }
          });
          rep[whichFile] = filtMeta;
        } else {
          rep[whichFile] = obj;
        }
        return true; //done with file
      });
    } else {
      return true; //no file
    }
  })).then(function() {
    // if folder has contents.json, gather names and metadata for all items
    // Originally I wrote this using Promise.all() to run all the requests in parallel,
    // but Dropbox returned errors saying "too many requests"!  So now it's sequential.
    if (self.contents) {
      rep.contNames = {};
      rep.contMeta = {};
      return self.contents.getJson().then(function(contents) {
        // promise chain for sequential execution
        var chain = Promise.resolve(true);
        // do photos, videos and folders
        File.containerNames.forEach(function(containerName) {
          var container = contents[containerName];
          if (container) {
            // do all items in this container
            // note that contents containers are arrays, not dictionaries
            container.forEach(function(id, i) {
              // find the item (might be folder or file)
              chain = chain.then(function() {
                return finder.parseAndFind(id).then(function(item) {
                  // add item name to our result
                  rep.contNames[item.id] = item.name;
                  // Overwrite id in container array to make sure it's canonical,
                  // for example change "A19-385-sherri-1956.jpg" to "A19-385".
                  // This lets the front end use the ids to look up metadata, names, etc.
                  // The container array we're updating is the one in the "contents" object,
                  // which is in the object cache and also pointed to by rep.contents.
                  // All these are refs to the same object so they will all see the change.
                  container[i] = item.id;
                  // does item's parent folder have metadata?
                  if (item.parent.meta) {
                    return item.parent.meta.getJson().then(function(meta) {
                      // does this item have metadata?
                      if (item.id in meta) {
                        // add item's metadata to our result
                        rep.contMeta[item.id] = meta[item.id];
                      }
                      // if parent folder is rated, supply default rating if rating absent
                      if ('_folder' in meta && meta._folder.rated) {
                        if (!rep.contMeta[item.id]) {
                          rep.contMeta[item.id] = {};
                        }
                        if (!('rating' in rep.contMeta[item.id])) {
                          rep.contMeta[item.id].rating = 3;
                        }
                      }
                      return true; //done
                    });
                  } else {
                    return true; //no meta
                  }
                }).catch(function(err) {
                  console.log("error gathering id "+id+": "+pic.getErrorMessage(err));
                });
              });
            });
          }
        });
        return chain;
      });
    } else {
      return true; //no contents
    }
  }).then(function() {
    // final result
    rep.meta = metaChg.applyChanges(rep.meta || {}, Object.keys(rep.names).splice(0, 0, '_folder'));
    if (rep.contMeta) {
      rep.contMeta = metaChg.applyChanges(rep.contMeta, Object.keys(rep.contNames));
    }
    return rep;
  });
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
  } else if (this.altFolderMap && (folderName in this.altFolderMap)) {
    return Promise.resolve(this.altFolderMap[folderName]);
  } else if (tryUpdate) {
    // folder not found, update and try again
    return this.freshUpdate().then(function() {
      return self.findFolder(folderName, childString, false);
    });
  } else {
    // folder still not found after updating, give up
    throw new Error("Folder not found: "+folderName+" in "+this.id);
  }
};

Folder.prototype.findFile = function(id, type, tryUpdate) {
  var self = this;
  var tinfo = File.typeInfo[type];
  if (tinfo) {
    var file = this[tinfo.containerName][id];
    if (file) {
      return Promise.resolve(file);
    } else if (tryUpdate) {
      // file not found, update and try again
      return this.freshUpdate().then(function() {
        return self.findFile(id, type, false);
      });
    } else {
      // file still not found after updating, give up
      throw new Error("File not found: "+id+" in "+this.id);
    }
  } else {
    throw new Error("Unknown type "+type);
  }
};

Folder.prototype.findVideoFolders = function(result) {
  result = result || {folders: [], names: {}};
  if (Object.keys(this.videos).length) {
    result.folders.push(this.id);
    result.names[this.id] = this.name;
  }
  Object.keys(this.folders).forEach(childId => {
    this.folders[childId].findVideoFolders(result);
  });
  return result;
};

module.exports = Folder;
