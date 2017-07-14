#!/usr/bin/env nodejs
var fs = require('fs');
var http = require('http');
var express = require('express');
var mydbx = require("./mydbx.js");
var Folder = require("./folder.js");
var root = {};

mydbx.filesGetMetadata({path: '/Pictures'})
  .then(function(response) {
    root = new Folder(null, response, {id: "/"});
    root.update()
      .then(function() {console.log("root update finished"); return root.folders["D17A"].update();})
      .then(function() {console.log("it is finished");});
  })
  .catch(function(error) {
    console.log(error);
  });

var app = express();
app.get('/pic/', function(req, res) {
  res.send(root.represent());
});

app.listen(8081, function() {
  console.log("Server listening on port 8081");
});
