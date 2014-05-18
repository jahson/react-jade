'use strict';

var React = require('react');

var tags = Object.keys(React.DOM);
var originalValues = tags.map(function (tag) { return React.DOM[tag]; });

exports.mock = mock;
function mock() {
  for (var i = 0; i < tags.length; i++) {
    React.DOM[tags[i]] = mockFor(tags[i]);
  }
  function mockFor(name) {
    return function (attribs, children) {
      if ('class' in attribs) throw new Error('Cannot have an attribute named "class", perhaps you meant "className"');
      if ('className' in attribs) {
        attribs['class'] = attribs.className;
        delete attribs.className;
      }
      if ('value' in attribs) throw new Error('Cannot have an attribute named "value", perhaps you meant "defaultValue"');
      if ('defaultValue' in attribs) {
        attribs['value'] = attribs.defaultValue;
        delete attribs.defaultValue;
      }
      if (attribs['class'] === '') delete attribs['class'];
      Object.keys(attribs).forEach(function (key) {
        if (attribs[key] === true) {
          attribs[key] = key;
        } else if (attribs[key] === false || attribs[key] === null || attribs[key] === undefined) {
          delete attribs[key];
        } else {
          attribs[key] = attribs[key] + '';
        }
      });
      return {
        type: 'tag',
        name: name,
        attribs: attribs,
        children: Array.isArray(children) ? children : (children ? [children] : [])
      };
    }
  }
}

exports.reset = reset;
function reset() {
  for (var i = 0; i < tags.length; i++) {
    React.DOM[tags[i]] = originalValues[i];
  }
}
