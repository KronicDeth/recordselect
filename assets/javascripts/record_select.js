Event.observe(window, 'load', function() {RecordSelect.document_loaded = true});

Form.Element.AfterActivity = function(element, callback, delay) {
  element = $(element);
  if (!delay) delay = 0.25;
  new Form.Element.Observer(element, delay, function(element, value) {
    // TODO: display loading indicator
    if (element.activity_timer) clearTimeout(element.activity_timer);
    element.activity_timer = setTimeout(function() {
      callback(element.value);
    }, delay * 1000 + 50);
  });
}

var RecordSelect = new Object();
RecordSelect.document_loaded = false;

RecordSelect.notify = function(item, options) {
  var e = Element.up(item, '.record-select-handler');
  var onselect = e.onselect || e.getAttribute('onselect');
  if (typeof onselect != 'function') onselect = eval(onselect);
  if (onselect)
  {
    try {
      onselect(options, (item.down('label') || item).innerHTML.unescapeHTML(), e);
    } catch(e) {
      alert(e);
    }
    return false;
  }
  else return true;
}

RecordSelect.Abstract = Class.create();
Object.extend(RecordSelect.Abstract.prototype, {
  /**
   * obj - the id or element that will anchor the recordselect to the page
   * url - the url to run the recordselect
   * options - ??? (check concrete classes)
   */
  initialize: function(obj, url, options) {
    this.obj = $(obj);
    this.url = url;
    this.options = options;
    this.container;

    if (RecordSelect.document_loaded) this.onload();
    else Event.observe(window, 'load', this.onload.bind(this));
  },

  /**
   * Finish the setup - IE doesn't like doing certain things before the page loads
   * --override--
   */
  onload: function() {},

  /**
   * the onselect event handler - when someone clicks on a record
   * --override--
   */
  onselect: function(options, value) {
    alert('options: ' + options + '\nvalue: ' + value);
  },

  /**
   * opens the recordselect
   */
  open: function() {
    if (this.is_open()) return;

    new Ajax.Updater(this.container, this.url, {
      method: 'get',
      evalScripts: true,
      asynchronous: true,
      onComplete: function() {
        this.show();
        // needs to be mousedown so the event doesn't get canceled by other code (see issue #26)
        Element.observe(document.body, 'mousedown', this.onbodyclick.bindAsEventListener(this));
      }.bind(this),
      // TODO pass in whether to send whole form
      parameters: this.obj.up('form').serialize(true)
    });
  },

  /**
   * positions and reveals the recordselect
   */
  show: function() {
    var offset = Position.cumulativeOffset(this.obj);
    this.container.style.left = offset[0] + 'px';
    this.container.style.top = (Element.getHeight(this.obj) + offset[1]) + 'px';

    if (this._use_iframe_mask()) {
      this.container.insertAdjacentHTML('afterEnd', '<iframe src="javascript:false;" class="record-select-mask" />');
      var mask = this.container.next('iframe');
      mask.style.left = this.container.style.left;
      mask.style.top = this.container.style.top;
    }

    this.container.show();

    if (this._use_iframe_mask()) {
      var dimensions = this.container.immediateDescendants().first().getDimensions();
      mask.style.width = dimensions.width + 'px';
      mask.style.height = dimensions.height + 'px';
    }
  },

  /**
   * closes the recordselect by emptying the container
   */
  close: function() {
    if (this._use_iframe_mask()) {
      this.container.next('iframe').remove();
    }

    this.container.hide();
    // hopefully by using remove() instead of innerHTML we won't leak memory
    this.container.immediateDescendants().invoke('remove');
  },

  /**
   * returns true/false for whether the recordselect is open
   */
  is_open: function() {
	  return (!this.container.innerHTML.blank())
  },

  /**
   * when the user clicks outside the dropdown
   */
  onbodyclick: function(ev) {
    if (!this.is_open()) return;
    var elem = $(Event.element(ev));
    var ancestors = elem.ancestors();
    ancestors.push(elem);
    if (ancestors.include(this.container) || ancestors.include(this.obj)) return;
    this.close();
  },

  /**
   * creates and initializes (and returns) the recordselect container
   */
  create_container: function() {
    new Insertion.Bottom(document.body, '<div class="record-select-container record-select-handler"></div>');
    e = document.body.childNodes[document.body.childNodes.length - 1];
    e.onselect = this.onselect.bind(this);
    e.style.display = 'none';

    return $(e);
  },

  /**
   * all the behavior to respond to a text field as a search box
   */
  _respond_to_text_field: function(text_field) {
    // attach the events to start this party
    text_field.observe('focus', this.open.bind(this));

    // the autosearch event - needs to happen slightly late (keyup is later than keypress)
    text_field.observe('keyup', function() {
      if (!this.is_open()) return;
      this.container.down('.text-input').value = text_field.value;
    }.bind(this));

    // keyboard navigation, if available
    if (this.onkeypress) {
      text_field.observe('keypress', this.onkeypress.bind(this));
    }
  },

  _use_iframe_mask: function() {
    return this.container.insertAdjacentHTML ? true : false;
  }
});

/**
 * Adds keyboard navigation to RecordSelect objects
 */
Object.extend(RecordSelect.Abstract.prototype, {
  current: null,

  /**
   * keyboard navigation - where to intercept the keys is up to the concrete class
   */
  onkeypress: function(ev) {
    var elem;
    switch (ev.keyCode) {
      case Event.KEY_UP:
        if (this.current && this.current.up('.record-select')) elem = this.current.previous();
        if (!elem) elem = this.container.getElementsBySelector('ol li.record').last();
        this.highlight(elem);
        break;
      case Event.KEY_DOWN:
        if (this.current && this.current.up('.record-select')) elem = this.current.next();
        if (!elem) elem = this.container.getElementsBySelector('ol li.record').first();
        this.highlight(elem);
        break;
      case Event.KEY_SPACE:
      case Event.KEY_RETURN:
        if (this.current) this.current.down('a').onclick();
        break;
      case Event.KEY_RIGHT:
        elem = this.container.down('li.pagination.next');
        if (elem) elem.down('a').onclick();
        break;
      case Event.KEY_LEFT:
        elem = this.container.down('li.pagination.previous');
        if (elem) elem.down('a').onclick();
        break;
      case Event.KEY_ESC:
        this.close();
        break;
      default:
        return;
    }
    Event.stop(ev); // so "enter" doesn't submit the form, among other things(?)
  },

  /**
   * moves the highlight to a new object
   */
  highlight: function(obj) {
    if (this.current) this.current.removeClassName('current');
    this.current = $(obj);
    obj.addClassName('current');
  }
});

/**
 * Used by link_to_record_select
 * The options hash should contain a onselect: key, with a javascript function as value
 */
RecordSelect.Dialog = Class.create();
RecordSelect.Dialog.prototype = Object.extend(new RecordSelect.Abstract(), {
  onload: function() {
    this.container = this.create_container();
    this.obj.observe('click', this.toggle.bind(this));

    if (this.onkeypress) this.obj.observe('keypress', this.onkeypress.bind(this));
  },

  onselect: function(options, value) {
    if (this.options.onselect(options, value) != false) this.close();
  },

  toggle: function() {
    if (this.is_open()) this.close();
    else this.open();
  }
});

/**
 * Used by record_select_field helper
 * The options hash may contain id: and label: keys, designating the current value
 * The options hash may also include an onchange: key, where the value is a javascript function (or eval-able string) for an callback routine.
 */
RecordSelect.Single = Class.create();
RecordSelect.Single.prototype = Object.extend(new RecordSelect.Abstract(), {
  onload: function() {
    // initialize the container
    this.container = this.create_container();
    this.container.addClassName('record-select-autocomplete');

    this.hidden_inputs = new Hash();
    this.hidden_inputs_base_name = this.obj.name;
    this.obj.name = '';

    // initialize the values
    var initial_options = null
    if ('attributes' in this.options) {
      initial_options = this.options.attributes
    }
    this.set(initial_options, this.options.label);

    this._respond_to_text_field(this.obj);
    if (this.obj.focused) this.open(); // if it was focused before we could attach observers
  },

  close: function() {
    // if they close the dialog with the text field empty, then delete the id value
    if (this.obj.value == '') {
      this.set(null, '');
    }

    RecordSelect.Abstract.prototype.close.call(this);
  },

  onselect: function(options, value) {
    if (this.options.onchange) this.options.onchange(options, value);
    this.set(options, value);
    this.close();
  },

  /**
   * sets the id/label
   */
  set: function(options, label) {
    this.obj.value = label.unescapeHTML();
    // Capture hash without this as this will be different in iterator for each.
    var hidden_inputs = this.hidden_inputs
    
    if (options == null) {
      hidden_inputs.each(function(pair) {
        // delete all hidden inputs so nothing submits
        hidden_inputs.get(pair.key).remove()
      });
    }
    else {
      options = $H(options)
      var option_keys = options.keys()
      var hidden_input_keys = hidden_inputs.keys()
      
      // delete hidden inputs that aren't in these options
      var removed_keys = hidden_input_keys.without(option_keys)
      removed_keys.each(function(key) {
        hidden_inputs.get(key).remove()
      })
      
      // create hidden inputs that don't exist yet but are in option
      var new_keys = option_keys.without(hidden_input_keys)
      var base_name = this.hidden_inputs_base_name;
      var base_object = this.obj
      new_keys.each(function(key) {
        new Insertion.After(base_object, 
                            '<input type="hidden" name="' + base_name +
                            '[' + key + ']' + '" />');
        inserted_object = base_object.next();
        hidden_inputs.set(key, inserted_object);
      })
      
      options.each(function(pair) {
        hidden_inputs.get(pair.key).value = pair.value;
      });
    }
  }
});

/**
 * Used by record_multi_select_field helper.
 * Options:
 *   list - the id (or object) of the <ul> to contain the <li>s of selected entries
 *   current - an array of id:/label: keys designating the currently selected entries
 */
RecordSelect.Multiple = Class.create();
RecordSelect.Multiple.prototype = Object.extend(new RecordSelect.Abstract(), {
  onload: function() {
    // initialize the container
    this.container = this.create_container();
    this.container.addClassName('record-select-autocomplete');

    // decide where the <li> entries should be placed
    if (this.options.list) this.list_container = $(this.options.list);
    else this.list_container = this.obj.next('ul');

    // take the input name from the text input, and store it for this.add()
    this.hidden_inputs_base_name = this.obj.name.replace(/\[\]$/, '');
    this.obj.name = '';

    // initialize the list
    $A(this.options.current).each(function(c) {
      this.add({id: c.id}, c.label.unescapeHTML());
    }.bind(this));

    this._respond_to_text_field(this.obj);
    if (this.obj.focused) this.open(); // if it was focused before we could attach observers
  },

  onselect: function(options, value) {
    this.add(options, value);
    this.close();
  },

  /**
   * Adds a record to the selected list
   */
  add: function(options, label) {
    // return silently if this value has already been selected
    var already_selected = this.list_container.getElementsBySelector('input').any(function(i) {
      return i.value == options['id']
    });
    if (already_selected) return;

    var escaped_name_prefix = RegExp.escape(this.hidden_inputs_base_name + '[');
    var name_prefix_reg_exp = new RegExp(escaped_name_prefix);
    var current_max_index = this.list_container.getElementsBySelector('input').max(function(i) {
      prefix_stripped = i.name.replace(name_prefix_reg_exp, '');
      suffix_stripped = prefix_stripped.replace(/\].*/, '');
      
      return parseInt(suffix_stripped);
    });
    if (typeof(current_max_index) == 'undefined') {
      current_max_index = -1;
    }
    var entry_index = current_max_index + 1;
    var entry = '<li>'
              + '<a href="#" onclick="$(this.parentNode).remove(); return false;" class="remove">remove</a>';
    $H(options).each(function(pair) {
      entry += '<input type="hidden" name="' +
               this.hidden_inputs_base_name + '[' + entry_index  + ']' + '[' + pair.key  + ']' +
               '" value="' + pair.value + '" />';
    }, this)
    
    entry += '<label>' + label.escapeHTML() + '</label>'
              + '</li>';
    new Insertion.Top(this.list_container, entry);
  }
});
