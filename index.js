#!/usr/bin/env nodejs
var fs = require('fs');
var express = require('express');
var pic = require("./pic.js");
var mydbx = require("./mydbx.js");
var Folder = require("./folder.js");
var File = require("./file.js");
var root = {};
var initLoadAll = true;
var cacheBaseDir = "./cache";

if (!fs.existsSync(cacheBaseDir)) {
  fs.mkdirSync(cacheBaseDir);
}
File.setCacheBaseDir(cacheBaseDir);

function getErrorMessage(error) {
  if (error.message) {
    return error.message;
  } else if (error.error) {
    return error.error;
  } else {
    console.log(error);
    return "An error happened!";
  }
}

mydbx.filesGetMetadata({path: "/Pictures"}).then(function(meta) {
  root = new Folder(null, meta, {id: "/"});
  return root.update(initLoadAll).then(function() {
    console.log("root update finished");
    console.log(root.count(true));
    return true; //done
  });
})
.catch(function(error) {
  console.log(getErrorMessage(error));
});

var app = express();
app.get("/gvypics/ls", function(req, res) {
  Promise.resolve(true).then(function() {
    return root.possibleUpdate().then(function() {
      res.json(root.represent());
      return true; //done
    });
  })
  .catch(function(error) {
    res.status(404).send(getErrorMessage(error));
  });
});

// find folder or file from parsed id
function findFolder(parts) {
  return root.findFolder(parts.parent, parts.child, true);
}

function findFile(folder, parts) {
  return folder.findFile(parts.id, parts.type, true);
}

app.get("/gvypics/ls/:id", function(req, res) {
  Promise.resolve(true).then(function() {
    var id = req.params.id;
    var parts = pic.parse(id);
    if (parts) {
      return findFolder(parts).then(function(folder) {
        if (parts.what === 'folder') {
          return folder.possibleUpdate().then(function() {
            res.json(folder.represent());
            return true; //done
          });
        } else if (parts.what === 'file') {
          return findFile(folder, parts).then(function(file) {
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
    res.status(404).send(getErrorMessage(error));
  });
});

app.get("/gvypics/pic/:id", function(req, res) {
  Promise.resolve(true).then(function() {
    var id = req.params.id;
    var parts = pic.parseFile(id);
    if (parts) {
      if (parts.type === "") {
        return findFolder(parts).then(function(folder) {
          return findFile(folder, parts).then(function(file) {
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
    res.status(404).send(getErrorMessage(error));
  });
});

app.get("/gvypics/vid/:id", function(req, res) {
  Promise.resolve(true).then(function() {
    var id = req.params.id;
    var parts = pic.parseFile(id);
    if (parts) {
      if (parts.type === "V") {
        return findFolder(parts).then(function(folder) {
          return findFile(folder, parts).then(function(file) {
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
    res.status(404).send(getErrorMessage(error));
  });
});

app.listen(8081, function() {
  console.log("Server listening on port 8081");
});
