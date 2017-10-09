var fs = require('fs');
var path = require('path');

function Cache(cacheDir, maxFiles) {
  this.cacheDir = cacheDir;
  this.maxFiles = maxFiles;
  this.nNewFiles = 0;
  this.nOldFiles = 0;
  this.oldFiles = [];
  this.oldIndex = {};
  this.scanning = false;
  this.scan();
}

// Scan cache directory and put all files in old array
Cache.prototype.scan = function(callback) {
  var self = this;
  var a = [];
  this.scanning = true;
  fs.readdir(this.cacheDir, function(err, files) {
    if (err) {
      console.log("error "+err.code+" scanning cache dir "+self.cacheDir);
      self.scanning = false;
    } else {
      try {
        files.forEach(function(fileName) {
          var cachePath = path.join(self.cacheDir, fileName);
          try {
            var stats = fs.statSync(cachePath);
            a.push({name: fileName, atime: stats.atime});
          } catch (e) {
            console.log("error "+e.code+" scanning cache file "+cachePath);
          }
        });
        // sort in decreasing time order (newest to oldest)
        a.sort(function(f1, f2) {
          return f2.atime - f1.atime;
        });
        // build index
        var x = {};
        a.forEach(function(f, i) {
          delete f.atime; //don't need this anymore, save memory
           x[f.name] = i;
        });
        // success
        self.oldFiles = a;
        self.oldIndex = x;
        self.nOldFiles = self.oldFiles.length;
        self.nNewFiles = 0;
        self.scanning = false;
        if (callback) {
          callback();
        }
      } catch (e) {
        console.log("!!! exception scanning cache dir "+self.cacheDir, e);
        self.scanning = false;
      }
    }
  });
};

// Specified file has just been accessed, update accordingly
Cache.prototype.touchFile = function(fileName) {
  //console.log("touchFile old="+this.nOldFiles+" new="+this.nNewFiles+" scanning="+this.scanning);
  // ignore if scan in progress
  if (!this.scanning) {
    // file in old array?
    var i = this.oldIndex[fileName];
    if (i !== undefined && i < this.oldFiles.length && this.oldFiles[i].name) {
      // sanity check
      if (this.oldFiles[i].name !== fileName) {
        console.log("!!! oldFiles[i].name is "+oldFiles[i].name+", expected "+fileName);
      }
      // remove from old array but leave element in place so we won't break the index
      this.oldFiles[i].name = null;
      this.nOldFiles -= 1;
      this.nNewFiles += 1;
    }
  }
};

// New file has been added to cache directory
Cache.prototype.addFile = function() {
  //console.log("addFile old="+this.nOldFiles+" new="+this.nNewFiles+" scanning="+this.scanning);
  // ignore if scan in progress
  if (!this.scanning) {
    // just count them for now, will pick up names on next scan
    this.nNewFiles += 1;
    // cache full?
    if (this.nOldFiles + this.nNewFiles > this.maxFiles) {
      this.shrinkCache(true);
    }
  }
};

// Delete excess files
Cache.prototype.shrinkCache = function(tryScan) {
  var self = this;
  while (this.nOldFiles + this.nNewFiles > this.maxFiles) {
    if (this.nOldFiles > 0) {
      this.removeOldestFile();
    } else if (tryScan) {
      console.log("scanning "+this.cacheDir);
      this.scan(function() {
        self.shrinkCache(false); //continue after scan completes
      });
      break; //done for now, continue in async mode
    } else {
      console.log("!!! can't shrink cache, old="+this.nOldFiles+" new="+this.nNewFiles+" max="+this.maxFiles);
    }
  }
};

// Delete the oldest file in the cache
Cache.prototype.removeOldestFile = function() {
  // pop old array until element found that hasn't been removed by touchFile()
  do {
    var f = this.oldFiles.pop();
  } while (f && !f.name);
  // found one? if so delete it.
  if (f) {
    this.nOldFiles -= 1;
    try {
      var cachePath = path.join(this.cacheDir, f.name);
      fs.unlinkSync(cachePath);
    } catch (e) {
      console.log("error "+e.code+" removing oldest file "+cachePath);
    }
  } else {
    console.log("!!! array empty but old="+this.nOldFiles);
    this.nOldFiles = 0;
  }
};

module.exports = Cache;
