#!/usr/bin/env nodejs
var fs = require('fs');
var http = require('http');
var mydbx = require("./mydbx.js");
var Folder = require("./folder.js");
var root;

mydbx.filesGetMetadata({path: '/Pictures'})
  .then(function(response) {
    root = new Folder(null, response);
  })
  .catch(function(error) {
    console.log(error);
  });

mydbx.filesListFolder({path: '/Pictures'})
  .then(function(response) {
    response.entries.forEach(function (item) {
      if (item['.tag'] === "folder") {
        new Folder(root, item);
      } else if (item['.tag'] === "file") {
        // is a file
      } else {
        console.log("Unknown item: "+item['.tag']);
      }
    });
    console.log("has_more="+response.has_more);
  })
  .catch(function(error) {
    console.log(error);
  });

http.createServer(function (req, res) {
  res.writeHead(200, {'Content-Type': 'text/plain'});
  res.end('Hello World 2\n');
}).listen(8081, 'localhost');
console.log('Server running at http://localhost:8081/');

