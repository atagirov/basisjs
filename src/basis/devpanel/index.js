basis.require('basis.ui');
basis.require('basis.dragdrop');
basis.require('basis.l10n');

var l10nInspector = resource('inspector/l10n.js').fetch();
var templateInspector = resource('inspector/template.js').fetch();

var themeList = resource('themeList.js').fetch();
var cultureList = resource('cultureList.js').fetch();


//
// panel
//
var panel = new basis.ui.Node({
  container: document.body,
  
  activated: false,
  themeName: basis.template.currentTheme().name,
  culture: basis.l10n.getCulture(),
  
  template: resource('template/panel.tmpl'),
  
  binding: {
    themeList: themeList,
    cultureList: cultureList,    
    activated: 'activated',
    themeName: 'themeName',
    base: function(object){
      return object.culture == 'base';
    },
    spriteX: {
      events: 'update',
      getter: function(object){
        var country = object.culture.split('-').pop();
        return country ? 16 * (country.charCodeAt(0) - 65) : 1000;
      }
    },
    spriteY: {
      events: 'update',
      getter: function(object){
        var country = object.culture.split('-').pop();
        return country ? 11 * (country.charCodeAt(1) - 65) : 1000;
      }
    }      
  },
  
  action: {
    inspectTemplate: function(){
      templateInspector.startInspect();
    },
    showThemes: function(){
      themeList.setDelegate(this);
    },
    inspectl10n: function(){
      l10nInspector.startInspect();
    },
    showCultures: function(){
      cultureList.setDelegate(this);
    },
    storePosition: function(event){
      if (localStorage){
        localStorage['basis-devpanel'] = parseInt(this.element.style.left) + ';' + parseInt(this.element.style.top);
      }
    }
  }
});

themeList.selection.addHandler({
  datasetChanged: function(object, delta){
    var theme = this.pick();
    panel.themeName = theme.value;
    panel.updateBind('themeName');
  }
});

cultureList.selection.addHandler({
  datasetChanged: function(object, delta){
    panel.culture = this.pick().value;
    panel.updateBind('base');
    panel.updateBind('spriteY');
    panel.updateBind('spriteX');
  }
});


//
// drag stuff
//
if (localStorage){
  var position = (localStorage['basis-devpanel'] || '10;10').split(';');
  panel.element.style.left = position[0] + 'px';
  panel.element.style.top = position[1] + 'px';  
}

new basis.dragdrop.MoveableElement({
  element: panel.element,
  trigger: panel.tmpl.dragElement
});


//
// exports
//

module.exports = panel;
