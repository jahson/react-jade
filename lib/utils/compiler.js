'use strict';

var fs = require('fs');
var constantinople = require('constantinople');
var ent = require('ent');
var uglify = require('uglify-js');
var runtime = require('pug-runtime');
var React = require('react');
var stringify = require('js-stringify');

var joinClasses = Function('', 'return ' + fs.readFileSync(__dirname + '/pug-join-classes.js', 'utf8'))();
var fixStyle = Function('', 'return ' + fs.readFileSync(__dirname + '/pug-fix-style.js', 'utf8'))();

function isConstant(src) {
  // return constantinople(str);
  return constantinople(src, {pug: runtime, 'pug_interp': undefined});
}
function toConstant(src) {
  // return constantinople.toConstant(str);
  return constantinople.toConstant(src, {pug: runtime, 'pug_interp': undefined});
}

module.exports = Compiler;
function Compiler(node) {
  this.node = node;
  this.mixins = {};
  this.dynamicMixins = false;
  this.eachBlockCount = 0;
}

Compiler.prototype.compile = function(){
  this.buf = [];
  this.visit(this.node);

  if (!this.dynamicMixins) {
    // if there are no dynamic mixins we can remove any un-used mixins
    var mixinNames = Object.keys(this.mixins);
    for (var i = 0; i < mixinNames.length; i++) {
      var mixin = this.mixins[mixinNames[i]];
      if (!mixin.used) {
        for (var x = 0; x < mixin.instances.length; x++) {
          for (var y = mixin.instances[x].start; y < mixin.instances[x].end; y++) {
            this.buf[y] = '';
          }
        }
      }
    }
  }
  return this.buf.join('\n');
};
Compiler.prototype.visit = function(node){
  if (typeof this['visit' + node.type] !== 'function') {
    throw new Error(node.type + ' is not supported');
  }
  return this['visit' + node.type](node);
};
Compiler.prototype.visitNamedBlock = function(block) {
    return this.visitBlock(block);
};
/**
 * Visit a `YieldBlock`.
 *
 * This is necessary since we allow compiling a file with `yield`.
 *
 * @param {YieldBlock} block
 * @api public
 */
Compiler.prototype.visitYieldBlock = function(block) {};
Compiler.prototype.visitBlock = function(block){
  for (var i = 0; i < block.nodes.length; i++) {
    this.visit(block.nodes[i]);
  }
};
Compiler.prototype.visitCase = function(node) {
  this.buf.push('switch (' + node.expr + '){');
  this.visit(node.block);
  this.buf.push('}');
};
Compiler.prototype.visitWhen = function(node) {
  if (node.expr === 'default') {
    this.buf.push('default:');
  } else {
    this.buf.push('case ' + node.expr +':');
  }
  if (node.block) {
    this.visit(node.block);
    this.buf.push('break;')
  }
};
Compiler.prototype.visitConditional = function(cond) {
  this.buf.push('if (' + cond.test +') {');
  this.visit(cond.consequent);
  this.buf.push('}');
  if (cond.alternate) {
    if (cond.alternate.Type === 'Conditional') {
      this.buf.push('else');
      this.visitConditional(cond.alternate)
    }
    this.buf.push('else {');
    this.visit(cond.alternate)
    this.buf.push('}');
  }
};
Compiler.prototype.visitCode = function (code) {
  // TODO: Name expected error is because of uglify
  if (code.buffer && !code.mustEscape) {
    this.buf.push('____.push(React.createElement("div", {dangerouslySetInnerHTML:{__html: ' + code.val + '}}))');
  } else if (code.buffer) {
    this.buf.push('____.push(' + code.val + ')');
  } else {
    this.buf.push(code.val);
  }

  if (code.block) {
    this.buf.push('{');
    this.visit(code.block);
    this.buf.push('}');
  }
  // console.log(this.buf)
};
Compiler.prototype.visitComment = function (comment) {
  this.buf.push('\n//' + comment.val + '\n');
};
Compiler.prototype.visitBlockComment = function (comment) {
  this.buf.push('/*');
  this.buf.push(comment.val);
  this.visit(comment.block);
  this.buf.push('*/');
};
Compiler.prototype.generateEachBlockName = function () {
  var name = 'pug_index' + this.eachBlockCount;
  this.eachBlockCount++;
  return name;
}
Compiler.prototype.visitEach = function (each) {
  var varName = each.key || this.generateEachBlockName();

  this.buf.push(''
    + '// iterate ' + each.obj + '\n'
    + ';____.push(function(){\n'
    + '  var ____ = [];\n'
    + '  var $$obj = ' + each.obj + ';\n'
    + '  if (\'number\' == typeof $$obj.length) {\n');

  if (each.alternate) {
    this.buf.push('  if ($$obj.length) {');
  }

  this.buf.push(
    'for (var ' + varName + ' = 0, $$l = $$obj.length; ' + varName + ' < $$l; ' + varName + '++) {\n'
    + 'var ' + each.val + ' = $$obj[' + varName + '];\n');

  this.visit(each.block);
  this.buf.push('}');

  if (each.alternate) {
    this.buf.push('  } else {');
    this.visit(each.alternate);
    this.buf.push('  }');
  }

  this.buf.push(''
    + '  } else {\n'
    + '    var $$l = 0;\n'
    + '    for (var ' + varName + ' in $$obj) {\n'
    + '      $$l++;\n'
    + '      var ' + each.val + ' = $$obj[' + varName + '];\n');

  this.visit(each.block);
  this.buf.push('}');

  if (each.alternate) {
    this.buf.push('if ($$l === 0) {');
    this.visit(each.alternate);
    this.buf.push('}');
  }

  this.buf.push('}');

  this.buf.push('return ____;');
  this.buf.push('}.call(this));');
};
Compiler.prototype.visitLiteral = function (literal) {
  if (/[<>&]/.test(literal.str)) {
    throw new Error('Plain Text cannot contain "<" or ">" or "&" in react-jade');
  } else if (literal.str.length !== 0) {
    this.buf.push('____.push(' + stringify(literal.str) + ')');
  }
};
Compiler.prototype.visitMixinBlock = function(block){
    this.buf.push('block && (____ = ____.concat(block.call(this)));');
};


Compiler.prototype.visitMixin = function(mixin) {
    var name = 'pug_mixins[';
    var args = mixin.args || '';
    var block = mixin.block;
    var attrs = mixin.attrs;
    var attrsBlocks = mixin.attributeBlocks;
    var pp = this.pp;
    var dynamic = mixin.name[0]==='#';
    var key = mixin.name;
    if (dynamic) this.dynamicMixins = true;
    name += (dynamic ? mixin.name.substr(2,mixin.name.length-3):'"'+mixin.name+'"')+']';

    this.mixins[key] = this.mixins[key] || {used: false, instances: []};
    if (mixin.call) {
      this.mixins[key].used = true;
      //if (pp) this.buf.push("pug_indent.push('" + Array(this.indents + 1).join('  ') + "');")
      if (block || attrs.length || attrsBlocks.length) {

        this.buf.push('____ = ____.concat(' + name + '.call(this, {');

        if (block) {
          this.buf.push('block: function(){');
          this.buf.push('var ____ = [];');
          // Render block with no indents, dynamically added when rendered
          this.visit(mixin.block);
          this.buf.push('return ____;');

          if (attrs.length || attrsBlocks.length) {
            this.buf.push('},');
          } else {
            this.buf.push('}');
          }
        }

        if (attrsBlocks.length) {
          if (attrs.length) {
            var val = getAttributes(attrs);
            attrsBlocks.unshift(val);
          }
          this.buf.push('attributes: pug_merge([' + attrsBlocks.join(',') + '])');
        } else if (attrs.length) {
          var val = getAttributes(attrs);
          this.buf.push('attributes: ' + val);
        }

        if (args) {
          this.buf.push('}, ' + args + '));');
        } else {
          this.buf.push('}));');
        }

      } else {
        this.buf.push('____ = ____.concat(' + name + '.call(this, {}');
        if (args) {
          this.buf.push(', ' + args + '));');
        } else {
          this.buf.push('));');
        }
      }
    } else {
      var mixin_start = this.buf.length;
      args = args ? args.split(',') : [];
      var rest;
      if (args.length && /^\.\.\./.test(args[args.length - 1].trim())) {
        rest = args.pop().trim().replace(/^\.\.\./, '');
      }
      this.buf.push(name + ' = function(pug_mixin_options');
      if (args.length) this.buf.push(',' + args.join(','));
      this.buf.push('){');
      this.buf.push('var block = (pug_mixin_options && pug_mixin_options.block), attributes = (pug_mixin_options && pug_mixin_options.attributes) || {};');
      if (rest) {
        this.buf.push('var ' + rest + ' = [];');
        this.buf.push('for (pug_interp = ' + (args.length + 1) + '; pug_interp < arguments.length; pug_interp++) {');
        this.buf.push('  ' + rest + '.push(arguments[pug_interp]);');
        this.buf.push('}');
      }
      this.buf.push('var ____ = [];');
      this.visit(block);
      this.buf.push('return ____;');
      this.buf.push('};');
      var mixin_end = this.buf.length;
      this.mixins[key].instances.push({start: mixin_start, end: mixin_end});
    }
};

Compiler.prototype.visitTag = function (tag) {
  // console.log(tag)
  var name = tag.name;
  if (/^[a-z]/.test(tag.name) && !tag.buffer) {
    name = '"' + name + '"';
  }
  this.buf.push('____.push(React.createElement.apply(React, ['+name);


  if (tag.name === 'textarea' && tag.code && tag.code.buffer && tag.code.escape) {
    tag.attrs.push({
      name: 'value',
      val: tag.code.val
    });
    tag.code = null;
  }
  var attrs;
  if (tag.attributeBlocks.length) {
    attrs = 'pug_fix_attrs(pug_merge([' + getAttributes(tag.attrs) + ',' + tag.attributeBlocks.join(',') + ']))';
  } else {
    attrs = getAttributes(tag.attrs, true);
  }
  this.buf.push(',' + attrs + ']');
  if (tag.code || (tag.block && tag.block.nodes.length)) {
    this.buf.push('.concat(function () { var ____ = [];');
    if (tag.code) this.visitCode(tag.code);
    this.visit(tag.block);
    this.buf.push('return ____;}.call(this))');
  }
  this.buf.push('))');
};
Compiler.prototype.visitText = function (text) {
  // TODO: string interpolation
  if (/[<>&]/.test(text.val.replace(/&((#\d+)|#[xX]([A-Fa-f0-9]+)|([^;\W]+));?/g, ''))) {
    throw new Error('Plain Text cannot contain "<" or ">" or "&" in react-jade');
  } else if (text.val.length !== 0) {
    text.val = ent.decode(text.val);
    this.buf.push('____.push(' + stringify(text.val) + ')');
  }
};

function getAttributes(attrs, fixAttributeNames){
  var buf = [];
  var classes = [];

  attrs.forEach(function(attr){
    var key = attr.name;
    if (fixAttributeNames && key === 'for') key = 'htmlFor';
    if (fixAttributeNames && key === 'maxlength') key = 'maxLength';
    if (key.substr(0, 2) === 'on') {
      var ast = uglify.parse('pug_interp = (' + attr.val + ')');
      var val = ast.body[0].body.right;
      if (val.TYPE === 'Call') {
        if (val.expression.TYPE !== 'Dot' && val.expression.TYPE !== 'Sub') {
          val.expression = new uglify.AST_Dot({
            expression: val.expression,
            property: 'bind'
          });
          val.args.unshift(new uglify.AST_Null({}));
          attr.val = val.print_to_string();
        } else if ((val.expression.TYPE === 'Dot' && val.expression.property !== 'bind') ||
                   val.expression.TYPE == 'Sub')  {
          var obj = val.expression.expression;
          val.expression.expression = new uglify.AST_SymbolRef({name: 'pug_interp'});
          val.expression = new uglify.AST_Dot({
            expression: val.expression,
            property: 'bind'
          });
          val.args.unshift(new uglify.AST_SymbolRef({name: 'pug_interp'}));
          val = new uglify.AST_Seq({
            car: new uglify.AST_Assign({
              operator: '=',
              left: new uglify.AST_SymbolRef({name: 'pug_interp'}),
              right: obj
            }),
            cdr: val
          });
          attr.val = '(' + val.print_to_string() + ')';
        }
      }
    }
    if (/Link$/.test(key)) {
      // transform: valueLink = this.state.name
      // into:      valueLink = {value: this.state.name,requestChange:function(v){ this.setState({name:v})}.bind(this)}
      var ast = uglify.parse('pug_interp = (' + attr.val + ')');
      var val = ast.body[0].body.right;
      if (val.TYPE === 'Dot' && val.expression.TYPE === 'Dot' &&
          val.expression.expression.TYPE === 'This' && val.expression.property === 'state') {
        attr.val = '{value:this.state.' + val.property + ',' +
          'requestChange:function(v){this.setState({' + val.property + ':v})}.bind(this)}';
      }
    }
    if (key === 'class') {
      classes.push(attr.val);
    } else if (key === 'style') {
      if (isConstant(attr.val)) {
        var val = toConstant(attr.val);
        buf.push(stringify(key) + ': ' + stringify(fixStyle(val)));
      } else {
        buf.push(stringify(key) + ': pug_fix_style(' + attr.val + ')');
      }
    } else if (isConstant(attr.val)) {
      // TODO: className will go here if it's value is constant
      var val = toConstant(attr.val);
      buf.push(stringify(key) + ': ' + stringify(val));
    } else {
      var val = attr.val;
      // TODO: className will go here if it contains expression
      if (attr.mustEscape === true) {
        val = runtime.escape(val);
      }
      buf.push(stringify(key) + ': ' + val);
    }
  });
  if (classes.length) {
    if (classes.every(isConstant)) {
      classes = stringify(joinClasses(classes.map(toConstant)));
    } else {
      classes = 'pug_join_classes([' + classes.join(',') + '])';
    }
    if (classes.length)
      buf.push('"' + (fixAttributeNames ? 'className' : 'class') + '": ' + classes);
  }
  return '{' + buf.join(',') + '}';
}
