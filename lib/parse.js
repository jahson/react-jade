'use strict';

var fs = require('fs');
var assert = require('assert');
var uglify = require('uglify-js');
var path = require('path');
var parse = require('pug-parser');
var lex = require('pug-lexer');
var link = require('pug-linker');
var load = require('pug-load');
var stripComments = require('pug-strip-comments');
var runtime = require('pug-runtime');
var addWith = require('with');
var Compiler = require('./utils/compiler.js');
var JavaScriptCompressor = require('./utils/java-script-compressor.js');

var pug_join_classes = fs.readFileSync(__dirname + '/utils/pug-join-classes.js', 'utf8');
var pug_fix_style = fs.readFileSync(__dirname + '/utils/pug-fix-style.js', 'utf8');
var pug_fix_attrs = fs.readFileSync(__dirname + '/utils/pug-fix-attrs.js', 'utf8');
var pug_merge = fs.readFileSync(__dirname + '/utils/pug-merge.js', 'utf8');
var setLocals = fs.readFileSync(__dirname + '/utils/set-locals.js', 'utf8');

module.exports = parseStr;

function parseStr(str, options) {
  var options = options || {};
  var dependencies = [];
  var ast = load.string(str, {
    filename: options.filename,
    basedir: options.basedir,
    lex: function (str, options) {
      return lex(str, options);
    },
    parse: function (tokens, options) {
      tokens = tokens.map(function (token) {
        if (token.type === 'path' && path.extname(token.val) === '') {
          return {
            type: 'path',
            line: token.line,
            col: token.col,
            val: token.val + '.pug'
          };
        }
        return token;
      });
      tokens = stripComments(tokens, options);
      return parse(tokens, options);
    },
    resolve: function (filename, source, loadOptions) {
      return load.resolve(filename, source, loadOptions);
    },
    read: function (filename, loadOptions) {
      dependencies.push(filename);

      var contents;
      contents = load.read(filename, loadOptions);

      return contents;
    }
  });
  ast = link(ast);

  // var parser = new Parser(lex(str, options), {
  //   filename: options.filename,
  //   src: str
  // });
  // var tokens;
  // try {
  //   // Parse
  //   tokens = parser.parse();
  // } catch (err) {
  //   parser.error(err);
  //   runtime.rethrow(err, parser.filename, parser.lexer.lineno, parser.input);
  // }
  var compiler = new Compiler(ast);

  var src = compiler.compile();
  src = [
    pug_join_classes + ';',
    pug_fix_style + ';',
    pug_fix_attrs + ';',
    pug_merge + ';',
    'var pug_mixins = {};',
    'var pug_interp;',
    src
  ].join('\n')

  var ast = uglify.parse(';(function () {' + src + '}.call(this));', {
    filename: options.filename
  });

  ast.figure_out_scope();
  ast = ast.transform(uglify.Compressor({
    sequences: false,   // join consecutive statemets with the “comma operator"
    properties: true,   // optimize property access: a["foo"] → a.foo
    dead_code: true,    // discard unreachable code
    unsafe: true,       // some unsafe optimizations (see below)
    conditionals: true, // optimize if-s and conditional expressions
    comparisons: true,  // optimize comparisonsx
    evaluate: true,     // evaluate constant expressions
    booleans: true,     // optimize boolean expressions
    loops: true,        // optimize loops
    unused: true,       // drop unused variables/functions
    hoist_funs: true,   // hoist function declarations
    hoist_vars: false,  // hoist variable declarations
    if_return: true,    // optimize if-s followed by return/continue
    join_vars: false,   // join var declarations
    cascade: true,      // try to cascade `right` into `left` in sequences
    side_effects: true, // drop side-effect-free statements
    warnings: false,     // warn about potentially dangerous optimizations/code
    global_defs: {}     // global definitions));
  }));

  ast = ast.transform(new JavaScriptCompressor());

  src = ast.body[0].body.expression.expression.body.map(function (statement) {
    return statement.print_to_string({
      beautify: true,
      comments: true,
      indent_level: 2
    });
  }).join('\n');
  src = addWith('locals || {}', src, [
    '___',
    'React',
    'Array',
    'undefined'
  ]);
  var js = 'var fn = function (locals) {' +
    'var ____ = [];' +
    src +
    'if (____.length === 1 && !Array.isArray(____[0])) { return ____.pop() };' +
    '____.unshift("div", null);' +
    'return React.createElement.apply(React, ____);' +
    '}';

  // Check that the compiled JavaScript code is valid thus far.
  // uglify-js throws very cryptic errors when it fails to parse code.
  try {
    Function('', js);
  } catch (ex) {
    console.log(js);
    throw ex;
  }

  var ast = uglify.parse(js + ';\nfn.locals = ' + setLocals + ';', {
    filename: options.filename
  });
  js = ast.print_to_string({
    beautify: true,
    comments: true,
    indent_level: 2
  });
  // console.log(js)
  return js + ';\nreturn fn;';
}
