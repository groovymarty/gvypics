#!/usr/bin/env nodejs
var fs = require('fs');
var express = require('express');
var pic = require("./pic.js");
var mydbx = require("./mydbx.js");
var Folder = require("./folder.js");
var File = require("./file.js");
var finder = require("./finder.js");
var root = {};
var initLoadAll = true;
var cacheBaseDir = "./cache";

if (!fs.existsSync(cacheBaseDir)) {
  fs.mkdirSync(cacheBaseDir);
}
File.setCacheBaseDir(cacheBaseDir);

mydbx.filesGetMetadata({path: "/Pictures"}).then(function(meta) {
  root = new Folder(null, meta, {id: "/"});
  finder.setRootFolder(root);
  return root.update(initLoadAll).then(function() {
    console.log("root update finished");
    console.log(root.count(true));
    return true; //done
  });
})
.catch(function(error) {
  console.log(pic.getErrorMessage(error));
});

var app = express();
//app.use(express.static("../gvyweb")); //mhs for testing

app.get("/gvypics/ls", function(req, res) {
  Promise.resolve(true).then(function() {
    return root.possibleUpdate(req.query).then(function() {
      return root.represent().then(function(rep) {
        res.json(rep);
        return true; //done
      });
    });
  })
  .catch(function(error) {
    res.status(404).send(pic.getErrorMessage(error));
  });
});

// List specified folder or file, returns JSON
app.get("/gvypics/ls/:id", function(req, res) {
  Promise.resolve(true).then(function() {
    var id = req.params.id;
    var parts = pic.parse(id);
    if (parts) {
      return finder.findFolder(parts).then(function(folder) {
        if (parts.what === 'folder') {
          return folder.possibleUpdate(req.query).then(function() {
            return folder.represent().then(function(rep) {
              res.json(rep);
              return true; //done
            });
          });
        } else if (parts.what === 'file') {
          return finder.findFile(folder, parts).then(function(file) {
            // no promise needed for file.represent()
            res.json(file.represent());
            return true; //done
          });
        } else {
          throw new Error("Can't handle what="+parts.what);
        }
      });
    } else {
      throw new Error("Parse failed for "+id);
    }
  })
  .catch(function(error) {
    res.status(404).send(pic.getErrorMessage(error));
  });
});

// Return contents.json or mime.json of specified folder
// Not really needed because "ls" also returns contents and metadata, but handy for testing
function getJsonFile(req, res, whichFile) {
  Promise.resolve(true).then(function() {
    return finder.parseAndFindFolder(req.params.id).then(function(folder) {
      if (folder[whichFile]) {
        return folder[whichFile].getFile().then(function(data) {
          res.set("Content-Type", folder[whichFile].mime.name);
          res.end(data);
          return true; //done
        });
      } else {
        res.json("{}");
      }
    });
  })
  .catch(function(error) {
    res.status(404).send(pic.getErrorMessage(error));
  });
}  
  
app.get("/gvypics/contents/:id", function(req, res) {
  getJsonFile(req, res, 'contents');
});

app.get("/gvypics/meta/:id", function(req, res) {
  getJsonFile(req, res, 'meta');
});

// Return a picture or thumbnail (if sz specified)
app.get("/gvypics/pic/:id", function(req, res) {
  Promise.resolve(true).then(function() {
    var id = req.params.id;
    var parts = pic.parseFile(id);
    if (parts) {
      if (parts.type === "") {
        return finder.findFolder(parts).then(function(folder) {
          return finder.findFile(folder, parts).then(function(file) {
            if (req.query.sz) {
              return file.getThumbnail(req.query.sz).then(function(data) {
                res.set("Content-Type", "image/jpeg");
                res.end(data, 'binary');
                return true; //done
              });
            } else {
              res.set("Content-Type", file.mime.name);
              file.readStream().pipe(res);
              return true; //done
            }
          });
        });
      } else {
        throw new Error("Not a picture: "+id);
      }
    } else {
      throw new Error("Parse failed for "+id);
    }
  })
  .catch(function(error) {
    res.status(404).send(pic.getErrorMessage(error));
  });
});

// Return a video
app.get("/gvypics/vid/:id", function(req, res) {
  Promise.resolve(true).then(function() {
    var id = req.params.id;
    var parts = pic.parseFile(id);
    if (parts) {
      if (parts.type === "V") {
        return finder.findFolder(parts).then(function(folder) {
          return finder.findFile(folder, parts).then(function(file) {
            res.set("Content-Type", file.mime.name);
            var rs = file.readStream();
            // for videos, tell read stream to stop if our connection gets closed
            req.on('close', function() {
              rs.emit('stop');
            });
            rs.pipe(res);
            return true; //done
          });
        });
      } else {
        throw new Error("Not a video: "+id);
      }
    } else {
      throw new Error("Parse failed for "+id);
    }
  })
  .catch(function(error) {
    res.status(404).send(pic.getErrorMessage(error));
  });
});

app.listen(8081, function() {
  console.log("Server listening on port 8081");
});
