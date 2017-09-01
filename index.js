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

// find folder from parsed id
function findFolder(parts) {
  return findFolder4(root, parts.parent, parts.child, true);
}

// internal function that drills down to child folders
function findFolder4(curFolder, folderName, childString, tryUpdate) {
  var folder = curFolder.folders[folderName];
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
      return findFolder4(folder, folderName + childString.substr(0,iplus), childString.substr(iplus), true);
    } else {
      // no more children, we're done
      return Promise.resolve(folder);
    }
  } else if (tryUpdate) {
    // folder not found, update and try again
    return curFolder.update().then(function() {
      return findFolder4(curFolder, folderName, childString, false);
    });
  } else {
    // folder still not found after updating, give up
    return Promise.reject(new Error("Folder not found: "+folderName+" in "+curFolder.id));
  }
}

app.get("/pic/ls/:id", function(req, res) {
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
