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
    root.update(initLoadAll).then(function() {
      console.log("root update finished");
      console.log(root.count(true));
      return true; //done
    });
  })
  .catch(function(error) {
    console.log(error);
  });

var app = express();
app.get("/pic/ls", function(req, res) {
  res.json(root.represent());
});

function findParentFolder(parts) {
  var folder = root.folders[parts.parent];
  if (folder) {
    return Promise.resolve(folder);
  } else {
    return root.update().then(function() {
      return root.folders[parts.parent] ||
        Promise.reject(new Error("Parent folder not found: "+parts.parent));
    });
  }
}

function findChildFolder(parentFolder, parts) {
  if (parts.child) {
    var childId = parts.parent + parts.child;
    var folder = parentFolder.folders[childId];
    if (folder) {
      return Promise.resolve(folder);
    } else {
      return parentFolder.update().then(function() {
        return parentFolder.folders[childId] ||
          Promise.reject(new Error("Child folder not found: "+childId));
      });
    }
  } else {
    return Promise.resolve(parentFolder);
  }
}

app.get("/pic/ls/:id", function(req, res) {
  var id = req.params.id;
  var parts = pic.parse(id);
  if (parts) {
    findParentFolder(parts)
      .then(function(folder) {return findChildFolder(folder, parts);})
      .then(function(folder) {
        if (parts.what === 'folder') {
          folder.possibleUpdate().then(function() {
            res.json(folder.represent());
            return true; //done
          });
        } else {
          var file = folder.files[id];
          if (file) {
            res.json(file.represent());
            return true; //done
          } else {
            return Promise.reject(new Error("File not found: "+id));
          }
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
