function pug_merge(a, b) {
  if (arguments.length === 1) {
    var attrs = a[0];
    for (var i = 1; i < a.length; i++) {
      attrs = pug_merge(attrs, a[i]);
    }
    return attrs;
  }

  for (var key in b) {
    if (key === 'class') {
      a[key] = pug_join_classes([a[key], b[key]]);
    } else if (key === 'style') {
      a[key] = pug_fix_style(a[key]) || {};
      b[key] = pug_fix_style(b[key]) || {};
      for (var style in b[key]) {
        a[key][style] = b[key][style];
      }
    } else {
      a[key] = b[key];
    }
  }

  return a;
};
