#!/usr/bin/env nodejs
var fs = require('fs');
var express = require('express');
var bodyParser = require('body-parser');
var pic = require("./pic.js");
var mydbx = require("./mydbx.js");
var Folder = require("./folder.js");
var File = require("./file.js");
var finder = require("./finder.js");
var auth = require("./auth.js");
var metaChg = require("./metachg.js");
var root = {};
var initLoadAll = false;
var cacheBaseDir = "./cache";

if (!fs.existsSync(cacheBaseDir)) {
  fs.mkdirSync(cacheBaseDir);
}
File.setCacheBaseDir(cacheBaseDir);

mydbx.filesGetMetadata({path: "/Pictures"}).then(function(dbxmeta) {
  dbxmeta.name = "/";
  root = new Folder(null, dbxmeta, {id: ""});
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
app.use(bodyParser.json());
app.use(express.static("../gvyweb")); //mhs for testing

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

// List specified folder, returns JSON
app.get("/gvypics/ls/:id", function(req, res) {
  Promise.resolve(true).then(function() {
    return finder.parseAndFindFolder(req.params.id, req.query).then(function(folder) {
      return folder.represent().then(function(rep) {
        res.json(rep);
        return true; //done
      });
    });
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

// Set header for download
function possibleDownload(req, res, file, nameTail) {
  if (req.query.dl) {
    var dlFileName = file.name;
    if (nameTail) {
      var i = file.name.lastIndexOf('.');
      if (i >= 0) {
        // insert tail before extension
        dlFileName = file.name.substr(0, i) + nameTail + file.name.substr(i);
      } else {
        dlFileName += nameTail;
      }
    }
    res.set("Content-Disposition", "attachment; filename="+dlFileName);
  }
}

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
                possibleDownload(req, res, file, "-"+req.query.sz);
                res.set("Content-Type", "image/jpeg");
                res.end(data, 'binary');
                return true; //done
              });
            } else {
              possibleDownload(req, res, file);
              res.set("Content-Type", file.mime.name);
              res.set("Content-Length", file.size);
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
            possibleDownload(req, res, file);
            res.set("Content-Type", file.mime.name);
            res.set("Content-Length", file.size);
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

// Log in
app.get("/gvypics/login", function(req, res) {
  var tok = auth.processLogin(req.query.user, req.query.pw);
  res.set("Content-Type", "text/plain");
  if (tok) {
    res.status(200).send(tok);
  } else {
    res.status(403).end(); //forbidden
  }
});

// Log out
app.get("/gvypics/logout", function(req, res) {
  auth.processLogout(req.query.tok);
  res.set("Content-Type", "text/plain");
  res.status(200).end();
});

// Get user info
app.get("/gvypics/user", function(req, res) {
  var user = auth.validateToken(req.query.tok);
  if (user) {
    res.status(200).json(user);
  } else {
    res.status(401).end();
  }
});

// Post metadata changes
app.post("/gvypics/metachgs", function(req, res) {
  var user = auth.validateToken(req.body.token);
  if (user) {
    if (Array.isArray(req.body.chgs)) {
      metaChg.addChanges(user, req.body.chgs);
      res.set("Content-Type", "text/plain");
      res.status(200).end();
    } else {
      res.status(404).send("Array expected");
    }
  } else {
    res.status(401).end(); //unauthorized
  }
});

metaChg.readJournal();

var port = 8081;
app.listen(port, function() {
  console.log("Server listening on port "+port);
});
