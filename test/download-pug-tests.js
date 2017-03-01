'use strict';

var fs = require('fs');
var gethub = require('gethub');
var pugVersion = require('pug/package.json').version;
var downloadedVersion = '';

try {
  downloadedVersion = fs.readFileSync(__dirname + '/pug/version.txt', 'utf8');
} catch (ex) {
  // ignore non-existant version.txt file
}

if (downloadedVersion !== pugVersion) {
  gethub('pugjs', 'pug', 'pug@' + pugVersion, __dirname + '/pug', function (err) {
    if (err) throw err;
    fs.writeFileSync(__dirname + '/pug/version.txt', pugVersion);
  });
}
