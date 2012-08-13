
  basis.require('basis.event');


 /**
  * This namespace contains base classes and functions for components of Basis framework.
  *
  * Namespace overview:
  * - Const:
  *   {basis.data.STATE}, {basis.data.SUBSCRIPTION}
  * - Classes:
  *   {basis.data.DataObject}, {basis.data.KeyObjectMap},
  *   {basis.data.AbstractDataset}, {basis.data.Dataset}
  *
  * @namespace basis.data
  */

  var namespace = this.path;


  //
  // import names
  //

  var Class = basis.Class;
  var cleaner = basis.cleaner;

  var values = Object.values;
  var $self = Function.$self;

  var EventObject = basis.event.EventObject;
  var LISTEN = basis.event.LISTEN;
  var createEvent = basis.event.create;
  var events = basis.event.events;


  //
  // Main part
  //

  var NULL_OBJECT = {};
  var EMPTY_ARRAY = [];


  //
  // State scheme
  //

  var STATE_EXISTS = {};

 /**
  * @enum {string}
  */
  var STATE = {
    PRIORITY: [],

   /**
    * Registrate new state
    */
    add: function(state, order){
      var name = state.toUpperCase();
      var value = state.toLowerCase();

      this[name] = value;
      STATE_EXISTS[value] = name;

      if (order)
        order = this.PRIORITY.indexOf(order);
      else
        order = -1;

      if (order == -1)
        this.PRIORITY.push(value)
      else
        this.PRIORITY.splice(order, 0, value);
    },

    getList: function(){
      return Object.values(STATE_EXISTS);
    }
  };

  // Registrate base states

  STATE.add('READY');
  STATE.add('DEPRECATED');
  STATE.add('UNDEFINED');
  STATE.add('ERROR');
  STATE.add('PROCESSING');


  //
  // Subscription sheme
  //

  var subscriptionHandlers = {};
  var subscriptionSeed = 1;

 /**
  * @enum {number}
  */
  var SUBSCRIPTION = {
    NONE: 0,
    ALL: 0,

   /**
    * Registrate new type of subscription
    * @param {string} name
    * @param {Object} handler
    * @param {function()} action
    */
    add: function(name, handler, action){
      subscriptionHandlers[subscriptionSeed] = {
        handler: handler,
        action: action,
        context: {
          add: function(thisObject, object){
            if (object)
            {
              var subscriberId = SUBSCRIPTION[name] + '_' + thisObject.eventObjectId;

              if (!object.subscribers_)
                object.subscribers_ = {};

              if (!object.subscribers_[subscriberId])
              {
                var oldSubscriberCount = object.subscriberCount;
                object.subscribers_[subscriberId] = thisObject;
                object.subscriberCount += 1;
                object.event_subscribersChanged(oldSubscriberCount);
              }
              else
              {
                ;;;console.warn('Attempt to add dublicate subscription');
              }
            }
          },
          remove: function(thisObject, object){
            if (object)
            {
              var subscriberId = SUBSCRIPTION[name] + '_' + thisObject.eventObjectId;
              if (object.subscribers_[subscriberId])
              {
                var oldSubscriberCount = object.subscriberCount;
                delete object.subscribers_[subscriberId];
                object.subscriberCount -= 1;
                object.event_subscribersChanged(oldSubscriberCount);
              }
              else
              {
                ;;;console.warn('Trying remove non-exists subscription');
              }
            }
          }
        }
      };

      SUBSCRIPTION[name] = subscriptionSeed;
      SUBSCRIPTION.ALL |= subscriptionSeed;

      subscriptionSeed <<= 1;
    }
  };

 /**
  * Apply subscription according with current state.
  * For internal purposes only.
  */
  function applySubscription(object, mask, state){
    var idx = 1;
    var config;

    while (mask)
    {
      if (mask & 1)
      {
        config = subscriptionHandlers[idx];
        if (state & idx)
        {
          object.addHandler(config.handler, config.context);
          config.action(config.context.add, object);
        }
        else
        {
          object.removeHandler(config.handler, config.context);
          config.action(config.context.remove, object);
        }
      }
        
      mask >>= 1;
      idx <<= 1;
    }
  }

  // Registrate base subscription types

  SUBSCRIPTION.add(
    'DELEGATE',
    {
      delegateChanged: function(object, oldDelegate){
        this.remove(object, oldDelegate);
        this.add(object, object.delegate);
      }
    },
    function(action, object){
      action(object, object.delegate);
    }
  );

  SUBSCRIPTION.add(
    'TARGET',
    {
      targetChanged: function(object, oldTarget){
        this.remove(object, oldTarget);
        this.add(object, object.target);
      }
    },
    function(action, object){
      action(object, object.target);
    }
  );

  SUBSCRIPTION.add(
    'DATASET',
    {
      datasetChanged: function(object, oldDataset){
        this.remove(object, oldDataset);
        this.add(object, object.dataset);
      }
    },
    function(action, object){
      action(object, object.dataset);
    }
  );


  //
  // reg new type of listen
  //

  //LISTEN.add('delegate', 'delegateChanged');
  //LISTEN.add('target', 'targetChanged');


 /**
  * Base class for data classes.
  * @class
  */
  var AbstractDataObject = Class(EventObject, {
    className: namespace + '.AbstractDataObject',

   /**
    * State of object. Might be managed by delegate object (if used).
    * @type {basis.data.STATE|string}
    */
    state: STATE.READY,

   /**
    * Indicates if object influences to related objects or not (is
    * subscription on).
    * @type {boolean}
    */
    active: false,

   /**
    * Subscriber type indicates what sort of influence has current object on
    * related objects (delegate, source, dataSource etc).
    * @type {basis.data.SUBSCRIPTION|number}
    */
    subscribeTo: SUBSCRIPTION.NONE,

   /**
    * Count of subscribed objects. This property can use to determinate
    * is data update necessary or not. Usualy if object is in UNDEFINED
    * or DEPRECATED state and subscriberCount more than zero - update needed.
    * @type {number}
    * @readonly
    */
    subscriberCount: 0,

   /**
    * Subscribers list. Using to prevent subscriber dublicate count.
    * @type {Object}
    * @private
    */
    subscribers_: null,

   /**
    * Fires when state or state.data was changed.
    * @param {object} oldState Object state before changes.
    * @event
    */
    event_stateChanged: createEvent('stateChanged', 'oldState'),

   /**
    * Fires when count of subscribers (subscriberCount property) was changed.
    * @event
    */
    event_subscribersChanged: createEvent('subscribersChanged'),

   /**
    * Fires when state of subscription was changed.
    * @event
    */
    event_activeChanged: createEvent('activeChanged'),

   /**
    * @constructor
    */
    init: function(){
      // inherit
      EventObject.prototype.init.call(this);

      // subscription sheme: activate subscription if active
      if (this.active)
        applySubscription(this, this.subscribeTo, SUBSCRIPTION.ALL);
    },

   /**
    * Set new state for object. Fire stateChanged event only if state (or state text) was changed.
    * @param {basis.data.STATE|string} state New state for object
    * @param {Object=} data
    * @param {boolean=} forceEvent Fire stateChanged event even state didn't changed.
    * @return {boolean} Returns true if state was changed.
    */
    setState: function(state, data){
      var stateCode = String(state);

      if (!STATE_EXISTS[stateCode])
        throw new Error('Wrong state value');

      // set new state for object
      if (this.state != stateCode || this.state.data != data)
      {
        var oldState = this.state;

        this.state = Object(stateCode);
        this.state.data = data;

        this.event_stateChanged(oldState);

        return true; // state was changed
      }

      return false; // state wasn't changed
    },

   /**
    * Default action on deprecate, set object state to {basis.data.STATE.DEPRECATED},
    * but only if object isn't in {basis.data.STATE.PROCESSING} state.
    */
    deprecate: function(){
      if (this.state != STATE.PROCESSING)
        this.setState(STATE.DEPRECATED);
    },

   /**
    * Set new value for isActiveSubscriber property.
    * @param {boolean} isActive New value for {basis.data.DataObject#active} property.
    * @return {boolean} Returns true if {basis.data.DataObject#active} was changed.
    */
    setActive: function(isActive){
      isActive = !!isActive;

      if (this.active != isActive)
      {
        this.active = isActive;
        this.event_activeChanged();

        applySubscription(this, this.subscribeTo, SUBSCRIPTION.ALL * isActive);

        return true;
      }

      return false;
    },

   /**
    * Set new value for subscriptionType property.
    * @param {number} subscriptionType New value for {basis.data.DataObject#subscribeTo} property.
    * @return {boolean} Returns true if {basis.data.DataObject#subscribeTo} was changed.
    */
    setSubscription: function(subscriptionType){
      var curSubscriptionType = this.subscribeTo;
      var newSubscriptionType = subscriptionType & SUBSCRIPTION.ALL;
      var delta = curSubscriptionType ^ newSubscriptionType;

      if (delta)
      {
        this.subscribeTo = newSubscriptionType;

        if (this.active)
          applySubscription(this, delta, newSubscriptionType);

        return true;
      }

      return false;
    },

    destroy: function(){
      // remove subscriptions if necessary
      if (this.active)
        applySubscription(this, this.subscribeTo, 0);

      EventObject.prototype.destroy.call(this);

      this.state = STATE.UNDEFINED;
    }
  });


 /**
  * Key-value storage.
  * @class
  */
  var DataObject = Class(AbstractDataObject, {
    className: namespace + '.DataObject',

   /**
    * Set default subscription.
    */
    subscribeTo: SUBSCRIPTION.DELEGATE + SUBSCRIPTION.TARGET,

   /**
    * Using for data storing. Might be managed by delegate object (if used).
    * @type {Object}
    */
    data: null,

   /**
    * @type {boolean}
    */
    canHaveDelegate: true,

   /**
    * Flag determines object behaviour when assigned delegate is destroing:
    * - true - destroy object on delegate object destroing (cascade destroy)
    * - false - don't destroy object, detach delegate only
    * @type {boolean}
    */
    cascadeDestroy: false,

   /**
    * Object that manage data updates if assigned.
    * @type {basis.data.DataObject}
    */
    delegate: null,

   /**
    * Root of delegate chain. By default and when no delegate, it points to object itself.
    * @type {basis.data.DataObject}
    * @readonly
    */
    root: null,

   /**
    * Reference to root delegate if some object in delegate chain marked as targetPoint.
    * @type {basis.data.DataObject}
    * @readonly
    */
    target: null,

   /**
    * Flag to determine is this object target object or not. This property
    * is readonly and can't be changed after init.
    * @type {boolean}
    * @readobly
    */
    isTarget: false,

   /**
    * Fires on data changes.
    * @param {object} delta Delta of changes. Keys in delta are property
    * names that was changed, and values is previous value of property
    * (value of property before changes).
    * @event
    */
    event_update: createEvent('update', 'delta'),

   /**
    * Fires when delegate was changed.
    * @param {basis.data.DataObject} oldDelegate Object delegate before changes.
    * @event
    */
    event_delegateChanged: createEvent('delegateChanged', 'oldDelegate'),

   /**
    * Fires when root of delegate chain was changed.
    * @param {basis.data.DataObject} oldRoot Object root before changes.
    * @event
    */
    event_rootChanged: createEvent('rootChanged', 'oldRoot'),

   /**
    * Fires when target property was changed.
    * @param {basis.data.DataObject} oldTarget Object before changes.
    * @event
    */
    event_targetChanged: createEvent('targetChanged', 'oldTarget'),

   /**
    * Default listeners.
    * @inheritDoc
    */
    listen: {
      delegate: {
        update: function(object, delta){
          this.data = object.data;
          this.event_update(delta);
        },
        stateChanged: function(object, oldState){
          this.state = object.state;
          this.event_stateChanged(oldState);
        },
        targetChanged: function(object, oldTarget){
          this.target = object.target;

          var targetListenHandler = this.listen.target;
          if (targetListenHandler)
          {
            if (oldTarget)
              oldTarget.removeHandler(targetListenHandler, this);

            if (this.target)
              this.target.addHandler(targetListenHandler, this);
          }

          this.event_targetChanged(oldTarget);
        },
        rootChanged: function(object, oldRoot){
          this.data = object.data;
          this.root = object.root;
          this.event_rootChanged(oldRoot);
        },
        destroy: function(){
          if (this.cascadeDestroy)
            this.destroy();
          else
            this.setDelegate();
        }
      }
    },

   /**
    * @param {Object=} config The configuration of object.
    * @constructor
    */
    init: function(){
      // inherit
      AbstractDataObject.prototype.init.call(this);

      // data/delegate
      var delegate = this.delegate;

      if (delegate)
      {
        // assign a delegate
        // NOTE: ignore for this.data & this.state, no update/stateChanged events fired
        this.delegate = null;
        this.data = delegate.data;
        this.state = delegate.state;
        this.setDelegate(delegate);
      }
      else
      {
        this.root = this;

        // if data doesn't exists - init it
        if (!this.data)
          this.data = {};

        // set target property to itself if isTarget property true
        if (this.isTarget)
          this.target = this;
      }

      // subscription sheme: activate subscription if active
      if (this.active)
        applySubscription(this, this.subscribeTo, SUBSCRIPTION.ALL);
    },

   /**
    * 
    */
    setState: function(state, data){
      return this.root !== this
        ? this.root.setState(state, data)
        : AbstractDataObject.prototype.setState.call(this, state, data);
    },

   /**
    * Returns true if current object is connected to another object through delegate bubbling.
    * @param {basis.data.DataObject} object
    * @return {boolean} Whether objects are connected.
    */
    isConnected: function(object){
      if (object instanceof DataObject)
      {
        while (object && object !== this && object !== object.delegate)
          object = object.delegate;
          
        return object === this;
      }

      return false;
    },

   /**
    * Returns root delegate object (that haven't delegate).
    * @return {basis.data.DataObject}
    */
    getRootDelegate: function(){
      var object = this;

      while (object.delegate && object.delegate !== object)
        object = object.delegate;

      return object;
    },

   /**
    * Set new delegate object or reject it (if passed null).
    * @example
    *   var a = new basis.data.DataObject();
    *   var b = new basis.data.DataObject();
    *
    *   a.setDelegate(b);
    *   a.update({ prop: 123 });
    *   alert(a.data.prop); // shows 123
    *   alert(b.data.prop); // shows 123
    *   alert(a.data.prop === b.data.prop); // shows true
    *
    *   b.update({ prop: 456 });
    *   alert(a.data.prop); // shows 456
    *   alert(b.data.prop); // shows 456
    *   alert(a.data.prop === b.data.prop); // shows true
    *
    *   a.setState(basis.data.STATE.PROCESSING);
    *   alert(a.state); // shows 'processing'
    *   alert(a.state === b.state); // shows true
    * @param {basis.data.DataObject} delegate
    * @return {basis.data.DataObject} Returns current delegate object.
    */
    setDelegate: function(newDelegate){

      // check is newDelegate can be linked to this object as delegate
      if (this.canHaveDelegate && newDelegate && newDelegate instanceof DataObject)
      {
        // check for connected prevents from linking to objects
        // that has this object in delegate chains
        if (newDelegate.delegate && this.isConnected(newDelegate))
        {
          // DEBUG: show warning in debug mode that we drop delegate because it is already connected with object
          ;;;if (typeof console != 'undefined') console.warn('(debug) New delegate has already connected to object. Delegate assign has been ignored.', this, newDelegate);

          // newDelegate can't be assigned
          return false;
        }
      }
      else
      {
        // can't assign delegate if newDelegate isn't instance of DataObject
        newDelegate = null;
      }

      // only if newDelegate differ with current value
      if (this.delegate !== newDelegate)
      {
        var oldState = this.state;
        var oldData = this.data;
        var oldDelegate = this.delegate;
        var oldTarget = this.target;
        var oldRoot = this.root;
        var delta = {};

        var delegateListenHandler = this.listen.delegate;
        var targetListenHandler = (oldTarget || newDelegate) && (!newDelegate || newDelegate.target !== oldTarget) && this.listen.target;

        if (oldDelegate && delegateListenHandler)
          oldDelegate.removeHandler(delegateListenHandler, this);

        if (oldTarget && targetListenHandler)
          oldTarget.removeHandler(targetListenHandler, this);

        if (newDelegate)
        {
          // assing new delegate
          this.delegate = newDelegate;
          this.root = newDelegate.root;
          this.data = newDelegate.data;
          this.state = newDelegate.state;
          this.target = newDelegate.target;

          // calculate delta as difference between current data and delegate info
          for (var key in newDelegate.data)
            if (key in oldData === false)
              delta[key] = undefined;

          for (var key in oldData)
            if (oldData[key] !== newDelegate.data[key])
              delta[key] = oldData[key];

          if (delegateListenHandler)
            newDelegate.addHandler(delegateListenHandler, this);

          if (newDelegate.target && targetListenHandler)
            newDelegate.target.addHandler(targetListenHandler, this);

          // update & stateChanged can be fired only if new delegate was assigned;
          // otherwise (delegate drop) do nothing -> performance benefits

          // fire update event if any key in delta (data changed)
          for (var key in delta)
          {
            this.event_update(delta);
            break;
          }

          // fire stateChanged event if state was changed
          if (oldState !== this.state && (String(oldState) != this.state || oldState.data !== this.state.data))
            this.event_stateChanged(oldState);
        }
        else
        {
          // reset delegate and info
          this.delegate = null;
          this.target = null;
          this.root = this;
          this.data = {};

          // copy data, no update, no delta
          for (var key in oldData)
            this.data[key] = oldData[key];
        }

        // fire event if target changed
        if (this.root !== oldRoot)
          this.event_rootChanged(oldRoot);

        // fire event if target changed
        if (this.target !== oldTarget)
          this.event_targetChanged(oldTarget);

        // fire event if delegate changed
        this.event_delegateChanged(oldDelegate);

        // delegate was changed
        return true;
      }

      return false; // delegate doesn't changed
    },


   /**
    * Handle changing object data. Fires update event only if something was changed. 
    * @param {Object} data New values for object data holder (this.data).
    * @return {Object|boolean} Delta if object data (this.data) was updated or false otherwise.
    */
    update: function(data){
      if (this.root !== this)
        return this.root.update(data);

      if (data)
      {
        var delta = {};
        var updateCount = 0;

        for (var prop in data)
        {
          if (this.data[prop] !== data[prop])
          {
            updateCount++;
            delta[prop] = this.data[prop];
            this.data[prop] = data[prop];
          }
        }

        if (updateCount)
        {
          this.event_update(delta);
          return delta;
        }
      }

      return false;
    },


   /**
    * @destructor
    */
    destroy: function(){
      // drop delegate
      if (this.delegate)
        this.setDelegate();

      // inherit
      AbstractDataObject.prototype.destroy.call(this);

      // drop data & state
      this.data = NULL_OBJECT;
      this.root = null;
      this.target = null;
    }
  });

  //
  // KeyObjectMap
  //

  var KEYOBJECTMAP_MEMBER_HANDLER = {
    destroy: function(object){
      delete this.map[this.key];
    }
  };

 /**
  * @class
  */
  var KeyObjectMap = Class(null, {
    className: namespace + '.KeyObjectMap',

    itemClass: DataObject,
    keyGetter: $self,
    map_: null,

    extendConstructor_: true,
    init: function(){
      this.map_ = {};
      cleaner.add(this);
    },

    resolve: function(object){
      return this.get(this.keyGetter(object), object);
    },
    create: function(key, object){
      var itemConfig = {};

      if (key instanceof DataObject)
      {
        itemConfig.delegate = key;
      }
      else
      {
        itemConfig.data = {
          id: key,
          title: key
        };
      }

      return new this.itemClass(itemConfig);
    },
    get: function(key, object){
      var itemId = key instanceof DataObject ? key.eventObjectId : key;
      var item = this.map_[itemId];

      if (!item && object)
      {
        item = this.map_[itemId] = this.create(key, object);
        item.addHandler(KEYOBJECTMAP_MEMBER_HANDLER, {
          map: this.map_,
          key: itemId
        });
      }

      return item;
    },
    destroy: function(){
      cleaner.remove(this);

      var items = values(this.map_);
      for (var i = 0, item; item = items[i++];)
        item.destroy();
    }
  });


  //
  // Datasets
  //

 /**
  * Returns delta object
  */
  function getDelta(inserted, deleted){
    var delta = {};
    var result;

    if (inserted && inserted.length)
      result = delta.inserted = inserted;

    if (deleted && deleted.length)
      result = delta.deleted = deleted;

    if (result)
      return delta;
  }

 /**
  * @class
  */
  var AbstractDataset = Class(AbstractDataObject, {
    className: namespace + '.AbstractDataset',

   /**
    * Default state for dataset is undefined. It useful to trigger dataset update
    * on demand.
    * @inheritDoc
    */
    state: STATE.UNDEFINED,

   /**
    * Cardinality of set.
    * @type {number}
    * @readonly
    */
    itemCount: 0,

   /**
    * Set of members. 
    * @private
    */
    items_: null,

   /**
    * Set of all items, even items are not in member set. May be used as storage for
    * members, which provide posibility to avoid dublicates in resultinf set before
    * event_itemsChanged event be fired.
    * @type {Object}
    * @private
    */
    members_: null,

   /**
    * Cache array of members, for getItems method.
    * @type {Array.<basis.data.DataObject>}
    * @private
    */
    cache_: null,

   /**
    * @readonly
    */
    syncEvents: Class.oneFunctionProperty(
      function(){
        if (this.isSyncRequired())
          this.syncAction();
      },
      {
        stateChanged: true,
        subscribersChanged: true
      }
    ),

   /**
    * @readonly
    */
    isSyncRequired: function(){
      return this.subscriberCount > 0 && (this.state == STATE.UNDEFINED || this.state == STATE.DEPRECATED);
    },

   /**
    * @readonly
    */
    syncAction: false,

   /**
    * Fires when items changed.
    * @param {Object} delta Delta of changes. Must have property `inserted`
    * or `deleted`, or both of them. `inserted` property is array of new items
    * and `deleted` property is array of removed items.
    * @event
    */
    event_itemsChanged: createEvent('itemsChanged', 'delta') && function(delta){
      var items;
      var insertCount = 0;
      var deleteCount = 0;
      var object;

      // add new items
      if (items = delta.inserted)
      {
        while (object = items[insertCount])
        {
          this.items_[object.eventObjectId] = object;
          insertCount++;
        }
      }

      // remove old items
      if (items = delta.deleted)
      {
        while (object = items[deleteCount])
        {
          delete this.items_[object.eventObjectId];
          deleteCount++;
        }
      }

      // update item count
      this.itemCount += insertCount - deleteCount;

      // drop cache
      this.cache_ = null;

      // call event 
      events.itemsChanged.call(this, delta);
    },

   /**
    * @constructor
    */
    init: function(){
      // inherit
      DataObject.prototype.init.call(this);

      if (this.syncAction)
        this.setSyncAction(this.syncAction);

      this.members_ = {};
      this.items_ = {};
    },

   /**
    * Check is object in dataset.
    * @param {basis.data.DataObject} object Object check for.
    * @return {boolean} Returns true if object in dataset.
    */
    has: function(object){
      return !!(object && this.items_[object.eventObjectId]);
    },

   /**
    * Returns all items in dataset.
    * @return {Array.<basis.data.DataObject>} 
    */
    getItems: function(){
      if (!this.cache_)
        this.cache_ = values(this.items_);

      return this.cache_;
    },

   /**
    * Returns first any item if exists.
    * @return {basis.data.DataObject}
    */
    pick: function(){
      for (var objectId in this.items_)
        return this.items_[objectId];

      return null;
    },

   /**
    * Returns some N items from dataset if exists.
    * @param {number} count Max length of resulting array.
    * @return {Array.<basis.data.DataObject>} 
    */
    top: function(count){
      var result = [];

      if (count)
        for (var objectId in this.items_)
          if (result.push(this.items_[objectId]) >= count)
            break;

      return result;
    },

   /**
    * @param {Array.<basis.data.DataObject>} items
    */
    add: function(items){
    },

   /**
    * @param {Array.<basis.data.DataObject>} items
    */
    remove: function(items){
    },

   /**
    * @param {Array.<basis.data.DataObject>} items
    */
    set: function(items){
    },

   /**
    * @param {Array.<basis.data.DataObject>} items
    * @param {boolean=} set
    */
    sync: function(items, set){
    },

   /**
    * Removes all items from dataset.
    */
    clear: function(){
    },

   /**
    * @param {function} syncAction
    */
    setSyncAction: function(syncAction){
      if (typeof syncAction != 'function')
        syncAction = false;

      this.syncAction = syncAction;

      if (syncAction)
      {
        this.addHandler(this.syncEvents);
        if (this.isSyncRequired())
          this.syncAction();
      }
      else
      {
        this.removeHandler(this.syncEvents);
      }
    },

   /**
    * @destructor
    */
    destroy: function(){
      this.clear();

      // inherit
      DataObject.prototype.destroy.call(this);

      this.cache_ = EMPTY_ARRAY;  // empty array here, to prevent recalc cache
      this.itemCount = 0;

      this.members_ = null;
      this.items_ = null;
    }
  });

 /**
  * @class
  */
  var DatasetObject = Class(DataObject, {
    className: namespace + '.DatasetObject',

    subscribeTo: SUBSCRIPTION.DELEGATE + SUBSCRIPTION.TARGET + SUBSCRIPTION.DATASET,

    listen: {
      dataset: {
        itemsChanged: function(dataset, delta){
          this.itemCount = dataset.itemCount;
          this.event_itemsChanged(dataset, delta);
        },
        destroy: function(){
          this.setDataset();
        }
      }
    },

   /**
    * @type {basis.data.AbstractDataset}
    */
    dataset: null,

   /**
    * Fires when dataset was changed.
    * @param {basis.data.AbstractDataset} oldDataset
    * @event
    */
    event_datasetChanged: createEvent('datasetChanged', 'oldDataset'),

   /**
    * Proxy event of dataset. Fires when items of dataset was changed.
    * @param {object} delta
    * @event
    */
    event_itemsChanged: createEvent('itemsChanged', 'delta'),

   /**
    * @constructor
    */
    init: function(){
      var dataset = this.dataset;
      if (dataset)
      {
        this.dataset = null;
        this.setDataset(dataset);
      }

      DataObject.prototype.init.call(this);
    },

   /**
    * @param {basis.data.AbstractDataset} dataset
    */
    setDataset: function(dataset){
      if (dataset instanceof AbstractDataset == false)
        dataset = null;
      
      if (this.dataset !== dataset)
      {
        var listenHandler = this.listen.dataset;
        var oldDataset = this.dataset;

        if (listenHandler)
        {
          if (oldDataset)
            oldDataset.removeHandler(listenHandler, this);
          if (dataset)
            dataset.addHandler(listenHandler, this);
        }

        this.dataset = dataset;
        this.event_datasetChanged(oldDataset);
      }
    },

   /**
    * @destructor
    */
    destroy: function(){
      if (this.dataset)
        this.setDataset();

      DataObject.prototype.destroy.call(this);
    }
  });


 /**
  * @class
  */
  var Dataset = Class(AbstractDataset, {
    className: namespace + '.Dataset',

   /**
    * @inheritDoc
    */
    listen: {
      item: {
        destroy: function(object){
          this.remove([object]);
        }
      }
    },

   /**
    * @config {Array.<basis.data.DataObject>} items Initial set of items.
    * @constructor
    */
    init: function(){
      // inherit
      AbstractDataset.prototype.init.call(this);

      var items = this.items;
      if (items)
      {
        this.items = null;
        this.set(items);
      }
    },

    add: function(data){
      var delta;
      var memberMap = this.members_;
      var inserted = [];
      var listenHandler = this.listen.item;

      for (var i = 0; i < data.length; i++)
      {
        var object = data[i];
        if (object instanceof DataObject)
        {
          var objectId = object.eventObjectId;
          if (!memberMap[objectId])
          {
            memberMap[objectId] = object;

            if (listenHandler)
              object.addHandler(listenHandler, this);

            inserted.push(object);
          }
        }
      }

      // trace changes
      if (inserted.length)
      {
        this.event_itemsChanged(delta = {
          inserted: inserted
        });
      }

      return delta;
    },

    remove: function(data){
      var delta;
      var memberMap = this.members_;
      var deleted = [];
      var listenHandler = this.listen.item;

      for (var i = 0; i < data.length; i++)
      {
        var object = data[i];
        if (object instanceof DataObject)
        {
          var objectId = object.eventObjectId;
          if (memberMap[objectId])
          {
            if (listenHandler)
              object.removeHandler(listenHandler, this);

            delete memberMap[objectId];

            deleted.push(object);
          }
        }
      }

      // trace changes
      if (deleted.length)
      {
        this.event_itemsChanged(delta = {
          deleted: deleted
        });
      }

      return delta;
    },

    set: function(data){

      // a little optimizations
      if (!this.itemCount)
        return this.add(data);

      if (!data.length)
        return this.clear();

      // main part

      // build map for new data
      var memberMap = this.members_;
      var exists = {};  // unique input DataObject's
      var deleted = [];
      var inserted = [];
      var object;
      var objectId;
      var delta;
      var listenHandler = this.listen.item;

      for (var i = 0; i < data.length; i++)
      {
        object = data[i];

        if (object instanceof DataObject)
        {
          objectId = object.eventObjectId;
          exists[objectId] = object;

          // insert data
          if (!memberMap[objectId])
          {
            memberMap[objectId] = object;

            if (listenHandler)
              object.addHandler(listenHandler, this);

            inserted.push(object);
          }
        }
      }

      // delete data
      for (var objectId in memberMap)
      {
        if (!exists[objectId])
        {
          object = memberMap[objectId];

          if (listenHandler)
            object.removeHandler(listenHandler, this);

          delete memberMap[objectId];

          deleted.push(object);
        }
      }
      
      // fire event if any changes
      if (delta = getDelta(inserted, deleted))
        this.event_itemsChanged(delta);

      return delta;
    },

    sync: function(data, set){
      if (!data)
        return;

      Dataset.setAccumulateState(true);

      var memberMap = this.members_;
      var object;
      var objectId;
      var exists = {};
      var inserted = [];
      var deleted = [];
      var res;

      for (var i = 0; i < data.length; i++)
      {
        object = data[i];

        if (object instanceof DataObject)
        {
          objectId = object.eventObjectId;

          exists[objectId] = object;
          if (!memberMap[objectId])
            inserted.push(object);
        }
      }

      for (var objectId in this.items_)
      {
        if (!exists[objectId])
          this.items_[objectId].destroy();
      }

      if (set && inserted.length)
        res = this.add(inserted);

      Dataset.setAccumulateState(false);

      return res;
    },

    clear: function(){
      var delta;
      var deleted = this.getItems();
      var listenHandler = this.listen.item;

      if (deleted.length)
      {
        if (listenHandler)
          for (var i = deleted.length; i --> 0;)
            deleted[i].removeHandler(listenHandler, this);

        this.event_itemsChanged(delta = {
          deleted: deleted
        });
         
        this.members_ = {};
      }

      return delta;
    }
  });


  //
  // Accumulate dataset changes
  //

  Dataset.setAccumulateState = (function(){
    var proto = AbstractDataset.prototype;
    var realEvent = proto.event_itemsChanged;
    var setStateCount = 0;
    var urgentTimer;
    var eventCache = {};

    function flushCache(cache){
      var dataset = cache.dataset;
      realEvent.call(dataset, cache);
    }

    function flushAllDataset(){
      var eventCacheCopy = eventCache;
      eventCache = {};
      for (var datasetId in eventCacheCopy)
        flushCache(eventCacheCopy[datasetId]);
    }

    function storeDatasetDelta(delta){
      var dataset = this;
      var datasetId = dataset.eventObjectId;
      var inserted = delta.inserted;
      var deleted = delta.deleted;
      var cache = eventCache[datasetId];

      if (inserted && deleted)
      {
        if (cache)
        {
          delete eventCache[datasetId];
          flushCache(cache);
        }
        return realEvent.call(dataset, delta);
      }

      var mode = inserted ? 'inserted' : 'deleted';
      if (cache)
      {
        var array = cache[mode];
        if (!array)
          flushCache(cache);
        else
          return array.push.apply(array, inserted || deleted);
      }

      eventCache[datasetId] = delta;
      delta.dataset = dataset;
    }

    function urgentFlush(){
      urgentTimer = null;
      if (setStateCount)
      {
        ;;;if (typeof console != 'undefined') console.warn('(debug) Urgent flush dataset changes');
        setStateCount = 0;
        setAccumulateStateOff();
      }
    }

    function setAccumulateStateOff(){
      proto.event_itemsChanged = realEvent;
      flushAllDataset();
    }

    return function(state){
      if (state)
      {
        if (setStateCount == 0)
        {
          proto.event_itemsChanged = storeDatasetDelta;
          if (!urgentTimer)
            urgentTimer = setTimeout(urgentFlush, 0);
        }
        setStateCount++;
      }
      else
      {
        setStateCount -= setStateCount > 0;
        if (setStateCount == 0)
          setAccumulateStateOff();
      }
    }
  })();


  //
  // namespace wrapper
  //

  function dataWrapper(data){
    if (Array.isArray(data))
      return data.map(dataWrapper);
    else
      return { data: data };
  }

  this.setWrapper(dataWrapper);


  //
  // export names
  //

  module.exports = {
    // const
    STATE: STATE,
    SUBSCRIPTION: SUBSCRIPTION,

    // classes
    AbstractDataObject: AbstractDataObject,

    Object: DataObject,
    DataObject: DataObject,

    KeyObjectMap: KeyObjectMap,

    AbstractDataset: AbstractDataset,
    DatasetObject: DatasetObject,
    Dataset: Dataset
  };
