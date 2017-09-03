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
app.get("/gvypics/ls", function(req, res) {
  res.json(root.represent());
});

// find folder from parsed id
function findFolder(parts) {
  return root.findFolder(parts.parent, parts.child, true);
}

app.get("/gvypics/ls/:id", function(req, res) {
  var id = req.params.id;
  var parts = pic.parse(id);
  if (parts) {
    findFolder(parts)
      .then(function(folder) {
        if (parts.what === 'folder') {
          folder.possibleUpdate().then(function() {
            res.json(folder.represent());
            return true; //done
          });
        } else if (parts.what === 'file' && parts.type === "") {
          var picture = folder.pictures[parts.id];
          if (picture) {
            res.json(picture.represent());
            return true; //done
          } else {
            return Promise.reject(new Error("Picture not found: "+parts.id));
          }
        } else if (parts.what === 'file' && parts.type === "V") {
          var video = folder.videos[parts.id];
          if (video) {
            res.json(video.represent());
            return true; //done
          } else {
            return Promise.reject(new Error("Video not found: "+parts.id));
          }
        } else {
          res.status(404).send("Can't handle what="+parts.what+" type="+parts.type);
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
