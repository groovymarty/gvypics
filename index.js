#!/usr/bin/env nodejs
var fs = require('fs');
var express = require('express');
var pic = require("./pic.js");
var mydbx = require("./mydbx.js");
var Folder = require("./folder.js");
var root = {};
var initLoadAll = true;

mydbx.filesGetMetadata({path: "/Pictures"})
  .then(function(response) {
    root = new Folder(null, response, {id: "/"});
    return root.update(initLoadAll).then(function() {
      console.log("root update finished");
      console.log(root.count(true));
      return true; //done
    });
  })
  .catch(function(error) {
    console.log(error);
  });

var app = express();
app.get("/gvypics/ls", function(req, res) {
  root.possibleUpdate().then(function() {
    res.json(root.represent());  
  })
  .catch(function(error) {
    res.status(404).send(error.message);
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
  var id = req.params.id;
  var parts = pic.parse(id);
  if (parts) {
    findFolder(parts).then(function(folder) {
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
    })
    .catch(function(error) {
      res.status(404).send(error.message);
    });
  } else {
    res.status(404).send("Parse failed for "+id);
  }
});

app.listen(8081, function() {
  console.log("Server listening on port 8081");
});
