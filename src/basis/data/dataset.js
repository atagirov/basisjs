
  basis.require('basis.event');
  basis.require('basis.data');


 /**
  * Namespace overview:
  * - Classes:
  *   {basis.data.dataset.Merge}, {basis.data.dataset.Subtract},
  *   {basis.data.dataset.MapReduce}, {basis.data.dataset.Subset},
  *   {basis.data.dataset.Split}, {basis.data.dataset.Slice}
  *   {basis.data.dataset.Cloud}
  *
  * @see ./demo/defile/dataset.html
  *
  * @namespace basis.data.dataset
  */

  var namespace = this.path;


  //
  // import names
  //

  var Class = basis.Class;
  var oneFunctionProperty = Class.oneFunctionProperty;

  var extend = Object.extend;
  var values = Object.values;
  var $self = Function.$self;
  var $true = Function.$true;
  var $false = Function.$false;
  var arrayFrom = basis.array.from;
  var createEvent = basis.event.create;

  var SUBSCRIPTION = basis.data.SUBSCRIPTION;
  var DataObject = basis.data.DataObject;
  var KeyObjectMap = basis.data.KeyObjectMap;
  var AbstractDataset = basis.data.AbstractDataset;
  var Dataset = basis.data.Dataset;


  //
  // New subscription types
  //

  SUBSCRIPTION.add(
    'SOURCE',
    {
      sourceChanged: function(object, oldSource){
        this.remove(object, oldSource);
        this.add(object, object.source);
      },
      sourcesChanged: function(object, delta){
        var array;

        if (array = delta.inserted)
          for (var i = array.length; i --> 0;)
            this.add(object, array[i]);

        if (array = delta.deleted)
          for (var i = array.length; i --> 0;)
            this.remove(object, array[i]);
      }
    },
    function(action, object){
      var sources = object.sources || [object.source];

      for (var i = 0, source; source = sources[i++];)
        action(object, source);
    }
  );

  SUBSCRIPTION.add(
    'MINUEND',
    {
      operandsChanged: function(object, oldMinuend, oldSubtrahend){
        if (this.minuend !== oldMinuend)
        {
          this.remove(object, oldMinuend);
          this.add(object, object.minuend);
        }
      }
    },
    function(action, object){
      action(object, object.minuend);
    }
  );

  SUBSCRIPTION.add(
    'SUBTRAHEND',
    {
      operandsChanged: function(object, oldMinuend, oldSubtrahend){
        if (this.subtrahend !== oldSubtrahend)
        {
          this.remove(object, oldSubtrahend);
          this.add(object, object.subtrahend);
        }
      }
    },
    function(action, object){
      action(object, object.subtrahend);
    }
  );

  
 /**
  * @func
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

  //
  // Merge dataset 
  //

  var MERGE_DATASET_HANDLER = {
    itemsChanged: function(source, delta){
      var memberMap = this.members_;
      var updated = {};
      var deleted = [];

      var object;
      var objectId;

      if (delta.inserted)
      {
        for (var i = 0; object = delta.inserted[i]; i++)
        {
          objectId = object.eventObjectId;
        
          // check: is this object already known
          if (memberMap[objectId])
          {
            // item exists -> increase source links count
            memberMap[objectId].count++;
          }
          else
          {
            // registrate in source map
            memberMap[objectId] = {
              count: 1,
              object: object
            };
          }

          // mark as updated
          updated[objectId] = memberMap[objectId];
        }
      }

      if (delta.deleted)
      {
        for (var i = 0; object = delta.deleted[i]; i++)
        {
          objectId = object.eventObjectId;

          // mark as updated
          updated[objectId] = memberMap[objectId];

          // descrease source counter
          memberMap[objectId].count--;
        }
      }

      // build delta and fire event
      this.applyRule(updated);
    },
    destroy: function(source){
      this.removeSource(source);
    }
  };


 /**
  * @class
  */
  var Merge = Class(AbstractDataset, {
    className: namespace + '.Merge',

   /**
    * @inheritDoc
    */
    subscribeTo: SUBSCRIPTION.SOURCE,

   /**
    * Fires when source set changed.
    * @param {basis.data.AbstractDataset} dataset
    * @param {object} delta Delta of changes. Must have property `inserted`
    * or `deleted`, or both of them. `inserted` property is array of new sources
    * and `deleted` property is array of removed sources.
    * @event
    */
    event_sourcesChanged: createEvent('sourcesChanged', 'delta'),

   /**
    * @type {Array.<basis.data.AbstractDataset>}
    */
    sources: null,

   /**
    * @type {function(count, sourceCount):boolean}
    */
    rule: function(count, sourceCount){
      return count > 0;
    },

   /**
    * @inheritDoc
    */
    listen: {
      source: MERGE_DATASET_HANDLER
    },

   /**
    * @config {Array.<basis.data.AbstractDataset>} sources Set of source datasets for aggregate.
    * @constructor
    */
    init: function(){
      // inherit
      AbstractDataset.prototype.init.call(this);

      // init part
      var sources = this.sources;
      this.sources = [];
      if (sources)
        sources.forEach(this.addSource, this);
    },

   /**
    * Set new merge rule for dataset. Some types are available in basis.data.Dataset.Merge
    * @param {function(count, sourceCount):boolean} rule New rule.
    */
    setRule: function(rule){
      if (typeof rule != 'function')
        rule = Merge.UNION;

      if (this.rule !== rule)
      {
        this.rule = rule;
        this.applyRule();
      }
    },

   /**
    * Check all members are they match to rule or not.
    * @param {Object=} scope Key map that will be checked. If not passed than all members
    * will be checked.
    * @return {Object} Delta of member changes.
    */
    applyRule: function(scope){
      var memberMap = this.members_;
      var rule = this.rule;
      var sourceCount = this.sources.length;
      var inserted = [];
      var deleted = [];
      var memberCounter;
      var isMember;
      var delta;

      if (!scope)
        scope = memberMap;

      for (var objectId in scope)
      {
        memberCounter = memberMap[objectId];
        isMember = sourceCount && memberCounter.count && rule(memberCounter.count, sourceCount);

        if (isMember != !!this.items_[objectId])
          (isMember
            ? inserted // not in items -> insert
            : deleted  // already in items -> delete
          ).push(memberCounter.object); 

        if (memberCounter.count == 0)
          delete memberMap[objectId];
      }

      // fire event if delta found
      if (delta = getDelta(inserted, deleted))
        this.event_itemsChanged(delta);

      return delta;
    },

   /**
    * Add source from sources list.
    * @param {basis.data.AbstractDataset} source
    * @return {boolean} Returns true if new source added.
    */
    addSource: function(source){
      if (source instanceof AbstractDataset)
      {
        if (this.sources.add(source))
        {
          // add event listeners to source
          if (this.listen.source)
            source.addHandler(this.listen.source, this);

          // process new source objects and update member map
          var memberMap = this.members_;
          for (var objectId in source.items_)
          {
            // check: is this object already known
            if (memberMap[objectId])
            {
              // item exists -> increase source links count
              memberMap[objectId].count++;
            }
            else
            {
              // add to source map
              memberMap[objectId] = {
                count: 1,
                object: source.items_[objectId]
              };
            }
          }

          // build delta and fire event
          this.applyRule();

          // fire sources changes event
          this.event_sourcesChanged({
            inserted: [source]
          });

          return true;
        }
      }
      else
      {
        ;;;if(typeof console != 'undefined') console.warn(this.className + '.addSource: source isn\'t instance of AbstractDataset');
      }
    },

   /**
    * Removes source from sources list.
    * @param {basis.data.AbstractDataset} source
    * @return {boolean} Returns true if source removed.
    */
    removeSource: function(source){
      if (this.sources.remove(source))
      {
        // remove event listeners from source
        if (this.listen.source)
          source.removeHandler(this.listen.source, this);

        // process removing source objects and update member map
        var memberMap = this.members_;
        for (var objectId in source.items_)
          memberMap[objectId].count--;

        // build delta and fire event
        this.applyRule();

        // fire sources changes event
        this.event_sourcesChanged({
          deleted: [source]
        });

        return true;
      }
      else
      {
        ;;;if(typeof console != 'undefined') console.warn(this.className + '.removeSource: source isn\'t in dataset source list');
      }
    },

   /**
    * Synchonize sources list according new list.
    * TODO: optimize, reduce event_sourcesChanged and event_itemsChanged count
    * TODO: returns delta of source list changes
    * @param {Array.<basis.data.AbstractDataset>} sources
    */
    setSources: function(sources){
      var exists = arrayFrom(this.sources); // clone list

      for (var i = 0, source; source = sources[i]; i++)
      {
        if (source instanceof AbstractDataset)
        {
          if (!exists.remove(source))
            this.addSource(source);
        }
        else
        {
          ;;;if(typeof console != 'undefined') console.warn(this.className + '.setSources: source isn\'t type of AbstractDataset', source);
        }
      }

      exists.forEach(this.removeSource, this);
    },

   /**
    * Remove all sources. All members are removing as side effect.
    * TODO: optimize, reduce event_sourcesChanged and event_itemsChanged count
    */
    clear: function(){
      arrayFrom(this.sources).forEach(this.removeSource, this);
    },

   /**
    * @inheritDoc
    */
    destroy: function(){
      // inherit
      AbstractDataset.prototype.destroy.call(this);

      this.sources = null;
    }
  });

 /**
  * ANY source INCLUDE item
  * (by default)
  */
  Merge.UNION = Merge.prototype.rule;

 /**
  * ALL sources must INCLUDE item
  */
  Merge.INTERSECTION = function(count, sourceCount){
    return count == sourceCount;
  };

 /**
  * ONLY ONE source INCLUDE item
  */
  Merge.DIFFERENCE = function(count, sourceCount){
    return count == 1;
  };

 /**
  * MORE THAT ONE source INCLUDE item
  * make sence for more than one source (if one source - no filter)
  * for 2 sources it equal INTERSECTION
  * for 3 and more sources it equivalent UNION / DIFFERENCE (subtract)
  */
  Merge.MORE_THAN_ONE_INCLUDE = function(count, sourceCount){
    return sourceCount == 1 || count > 1;
  };

 /**
  * AT LEAST ONE source EXCLUDE item
  * make sence for more than one source (if one source - no filter)
  * for 2 sources it equal DIFFERENCE
  * for 3 and more sources it equivalent UNION / INTERSECTION (subtract)
  */
  Merge.AT_LEAST_ONE_EXCLUDE = function(count, sourceCount){
    return sourceCount == 1 || count < sourceCount;
  };


  //
  // Subtract
  //

  var datasetAbsentFilter = function(item){
    return !this.has(item);
  };

  var SUBTRACTDATASET_MINUEND_HANDLER = {
    itemsChanged: function(dataset, delta){
      if (!this.subtrahend)
        return;

      var newDelta = getDelta(
        /* inserted */ delta.inserted && delta.inserted.filter(datasetAbsentFilter, this.subtrahend),
        /* deleted */  delta.deleted  && delta.deleted.filter(this.has, this)
      );
      
      if (newDelta)
        this.event_itemsChanged(newDelta);
    },
    destroy: function(){
      this.setOperands(null, this.subtrahend);
    }
  };

  var SUBTRACTDATASET_SUBTRAHEND_HANDLER = {
    itemsChanged: function(dataset, delta){
      if (!this.minuend)
        return;

      var newDelta = getDelta(
        /* inserted */ delta.deleted  && delta.deleted.filter(datasetAbsentFilter, this),
        /* deleted */  delta.inserted && delta.inserted.filter(this.has, this)
      );

      if (newDelta)
        this.event_itemsChanged(newDelta);
    },
    destroy: function(){
      this.setOperands(this.minuend, null);
    }
  };


 /**
  * @class
  */
  var Subtract = Class(AbstractDataset, {
    className: namespace + '.Subtract',

   /**
    * @inheritDoc
    */
    subscribeTo: SUBSCRIPTION.MINUEND + SUBSCRIPTION.SUBTRAHEND,

   /**
    * @type {basis.data.AbstractDataset}
    */ 
    minuend: null,

   /**
    * @type {basis.data.AbstractDataset}
    */
    subtrahend: null,

   /**
    * Fires when minuend or substrahend changed.
    * @param {basis.data.DataObject} object Object which state was changed.
    * @param {object} oldState Object state before changes.
    * @event
    */
    event_operandsChanged: createEvent('operandsChanged', 'oldMinuend', 'oldSubtrahend'),

   /**
    * @inheritDoc
    */
    listen: {
      minuend: SUBTRACTDATASET_MINUEND_HANDLER,
      subtrahend: SUBTRACTDATASET_SUBTRAHEND_HANDLER
    },

   /**
    * @constructor
    */
    init: function(){
      // inherit
      AbstractDataset.prototype.init.call(this);

      // init part
      var minuend = this.minuend;
      var subtrahend = this.subtrahend;

      this.minuend = null;
      this.subtrahend = null;

      if (minuend || subtrahend)
        this.setOperands(minuend, subtrahend);
    },

   /**
    * Set new minuend & subtrahend.
    * @param {basis.data.AbstractDataset} minuend
    * @param {basis.data.AbstractDataset} subtrahend
    * @return {Object} Delta if changes happend
    */
    setOperands: function(minuend, subtrahend){
      var delta;
      var operandsChanged = false;

      if (minuend instanceof AbstractDataset == false)
        minuend = null;

      if (subtrahend instanceof AbstractDataset == false)
        subtrahend = null;

      var oldMinuend = this.minuend;
      var oldSubtrahend = this.subtrahend;

      // set new minuend if changed
      if (oldMinuend !== minuend)
      {
        operandsChanged = true;
        this.minuend = minuend;

        var listenHandler = this.listen.minuend;
        if (listenHandler)
        {
          if (oldMinuend)
            oldMinuend.removeHandler(listenHandler, this);

          if (minuend)
            minuend.addHandler(listenHandler, this)
        }
      }

      // set new subtrahend if changed
      if (oldSubtrahend !== subtrahend)
      {
        operandsChanged = true;
        this.subtrahend = subtrahend;

        var listenHandler = this.listen.subtrahend;
        if (listenHandler)
        {
          if (oldSubtrahend)
            oldSubtrahend.removeHandler(listenHandler, this);

          if (subtrahend)
            subtrahend.addHandler(listenHandler, this);
        }
      }

      if (!operandsChanged)
        return false;

      // emit event
      this.event_operandsChanged(oldMinuend, oldSubtrahend);

      // apply changes
      if (!minuend || !subtrahend)
      {
        if (this.itemCount)
          this.event_itemsChanged(delta = {
            deleted: this.getItems()
          });
      }
      else
      {
        var deleted = [];
        var inserted = [];

        for (var key in this.items_)
          if (!minuend.items_[key] || subtrahend.items_[key])
            deleted.push(this.items_[key]);

        for (var key in minuend.items_)
          if (!this.items_[key] && !subtrahend.items_[key])
            inserted.push(minuend.items_[key]);

        if (delta = getDelta(inserted, deleted))
          this.event_itemsChanged(delta);
      }

      return delta;
    },

   /**
    * @param {basis.data.AbstractDataset} minuend
    * @return {Object} Delta if changes happend
    */
    setMinuend: function(minuend){
      return this.setOperands(minuend, this.subtrahend);
    },

   /**
    * @param {basis.data.AbstractDataset} subtrahend
    * @return {Object} Delta if changes happend
    */
    setSubtrahend: function(subtrahend){
      return this.setOperands(this.minuend, subtrahend);
    },

   /**
    * @inheritDoc
    */
    clear: function(){
      this.setOperands();
    }
  });


  //
  // Source dataset mixin
  //

  var SourceDatasetMixin = {
   /**
    * @inheritDoc
    */
    subscribeTo: SUBSCRIPTION.SOURCE,

   /**
    * Data source.
    * @type {basis.data.AbstractDataset}
    */
    source: null,

   /**
    * Map of source objects.
    * @type {object}
    * @private
    */
    sourceMap_: null,

   /**
    * Fires when source property changed.
    * @param {basis.data.AbstractDataset} dataset Event initiator.
    * @param {basis.data.AbstractDataset} oldSource Previous value for source property.
    * @event
    */
    event_sourceChanged: createEvent('sourceChanged', 'oldSource'),

   /**
    * @inheritDoc
    */
    listen: {
      source: {
        destroy: function(){
          this.setSource();
        }
      }
    },

   /**
    * @constructor
    */
    init: function(){
      this.sourceMap_ = {};

      var source = this.source;
      if (source)
        this.source = null;     // NOTE: reset source before inherit -> prevent double subscription activation
                                // when this.active == true and source is assigned

      AbstractDataset.prototype.init.call(this);

      if (source)
        this.setSource(source);
    },

   /**
    * Set new source dataset.
    * @param {basis.data.AbstractDataset} dataset
    */
    setSource: function(source){
      if (source instanceof AbstractDataset == false)
        source = null;

      if (this.source !== source)
      {
        var oldSource = this.source;
        var listenHandler = this.listen.source;

        this.source = source;

        if (listenHandler)
        {
          var itemsChangedHandler = listenHandler.itemsChanged;
          if (oldSource)
          {
            oldSource.removeHandler(listenHandler, this);

            if (itemsChangedHandler)
              itemsChangedHandler.call(this, oldSource, {
                deleted: oldSource.getItems()
              });
          }

          if (source)
          {
            source.addHandler(listenHandler, this);

            if (itemsChangedHandler)
              itemsChangedHandler.call(this, source, {
                inserted: source.getItems()
              });
          }
        }

        this.event_sourceChanged(oldSource);
      }
    },

   /**
    * Drop dataset. All members are removing as side effect.
    */
    clear: function(){
      this.setSource();
    },

   /**
    * @inheritDoc
    */
    destroy: function(){
      // inherit
      AbstractDataset.prototype.destroy.call(this);

      this.sourceMap_ = null;
    }
  };


  //
  // MapReduce
  //

  var MAPREDUCE_SOURCEOBJECT_UPDATE = function(sourceObject){
    var newMember = this.map ? this.map(sourceObject) : object; // fetch new member ref
    
    if (newMember instanceof DataObject == false || this.reduce(newMember))
      newMember = null;

    var sourceMap = this.sourceMap_[sourceObject.eventObjectId];
    var curMember = sourceMap.member;

    // if member ref is changed
    if (curMember !== newMember)
    {
      var memberMap = this.members_;
      var delta;
      var inserted;
      var deleted;

      // update member
      sourceMap.member = newMember;

      // if here is ref for member already
      if (curMember)
      {
        var curMemberId = curMember.eventObjectId;

        // call callback on member ref add
        if (this.removeMemberRef)
          this.removeMemberRef(curMember, sourceObject);

        // decrease ref count, and check is this ref for member last
        if (--memberMap[curMemberId] == 0)
        {
          // last ref for member

          // delete from map
          delete memberMap[curMemberId];

          // add to delta
          deleted = [curMember];
        }
      }

      // if new member exists, update map
      if (newMember)
      {
        var newMemberId = newMember.eventObjectId;

        // call callback on member ref add
        if (this.addMemberRef)
          this.addMemberRef(newMember, sourceObject);

        if (memberMap[newMemberId])
        {
          // member is already in map -> increase ref count
          memberMap[newMemberId]++;
        }
        else
        {
          // add to map
          memberMap[newMemberId] = 1;

          // add to delta
          inserted = [newMember];
        }
      }

      // fire event, if any delta
      if (delta = getDelta(inserted, deleted))
        this.event_itemsChanged(delta);
    }
  };

  var MAPREDUCE_SOURCE_HANDLER = {
    itemsChanged: function(source, delta){
      var sourceMap = this.sourceMap_;
      var memberMap = this.members_;
      var inserted = [];
      var deleted = [];
      var sourceObject;
      var sourceObjectId;
      var member;
      var updateHandler = this.ruleEvents;

      Dataset.setAccumulateState(true);

      if (delta.inserted)
      {
        for (var i = 0; sourceObject = delta.inserted[i]; i++)
        {
          member = this.map ? this.map(sourceObject) : sourceObject;

          if (member instanceof DataObject == false || this.reduce(member))
            member = null;

          if (updateHandler)
            sourceObject.addHandler(updateHandler, this);

          sourceMap[sourceObject.eventObjectId] = {
            sourceObject: sourceObject,
            member: member
          };

          if (member)
          {
            var memberId = member.eventObjectId;
            if (memberMap[memberId])
            {
              memberMap[memberId]++;
            }
            else
            {
              memberMap[memberId] = 1;
              inserted.push(member);
            }

            if (this.addMemberRef)
              this.addMemberRef(member, sourceObject);
          }
        }
      }

      if (delta.deleted)
      {
        for (var i = 0; sourceObject = delta.deleted[i]; i++)
        {
          sourceObjectId = sourceObject.eventObjectId;
          member = sourceMap[sourceObjectId].member;

          if (updateHandler)
            sourceObject.removeHandler(updateHandler, this);

          delete sourceMap[sourceObjectId];

          if (member)
          {
            var memberId = member.eventObjectId;
            if (--memberMap[memberId] == 0)
            {
              delete memberMap[memberId];
              deleted.push(member);
            }

            if (this.removeMemberRef)
              this.removeMemberRef(member, sourceObject);
          }
        }
      }

      Dataset.setAccumulateState(false);

      if (delta = getDelta(inserted, deleted))
        this.event_itemsChanged(delta);
    }
  };

 /**
  * @class
  */
  var MapReduce = Class(AbstractDataset, SourceDatasetMixin, {
    className: namespace + '.MapReduce',

   /**
    * Map function for source object, to get member object.
    * @type {function(basis.data.DataObject):basis.data.DataObject}
    * @readonly
    */
    map: $self,

   /**
    * Filter function. It should return false, than result of map function
    * become a member.
    * @type {function(basis.data.DataObject):boolean}
    * @readonly
    */
    reduce: $false,

   /**
    * Helper function.
    */
    rule: Function.getter($true),

   /**
    * Events list when dataset should recompute rule for source item.
    */
    ruleEvents: oneFunctionProperty(
      MAPREDUCE_SOURCEOBJECT_UPDATE,
      {
        update: true
      }
    ),

   /**
    * NOTE: Can't be changed after init.
    * @type {function(basis.data.DataObject, basis.data.DataObject)}
    * @readonly
    */
    addMemberRef: null,

   /**
    * NOTE: Can't be changed after init.
    * @type {function(basis.data.DataObject, basis.data.DataObject)}
    * @readonly
    */
    removeMemberRef: null,

   /**
    * @inheritDoc
    */
    listen: {
      source: MAPREDUCE_SOURCE_HANDLER
    },

    // no special init

   /**
    * Set new transform function and apply new function to source objects.
    * @param {function(basis.data.DataObject):basis.data.DataObject} map
    */
    setMap: function(map){
      if (typeof map != 'function')
        map = $self;

      if (this.map !== map)
      {
        this.map = map;
        return this.applyRule();
      }
    },

   /**
    * Set new filter function and apply new function to source objects.
    * @param {function(basis.data.DataObject):boolean} reduce
    */
    setReduce: function(reduce){
      if (typeof reduce != 'function')
        reduce = $false;

      if (this.reduce !== reduce)
      {
        this.reduce = reduce;
        return this.applyRule();
      }
    },

   /**
    * Set new filter function.
    * @param {function(basis.data.DataObject):boolean} filter
    * @return {Object} Delta of member changes.
    */
    setRule: function(rule){
      if (typeof rule != 'function')
        rule = $true;

      if (this.rule !== rule)
      {
        this.rule = rule;
        return this.applyRule();
      }
    },

   /**
    * Apply transform for all source objects and rebuild member set.
    * @return {Object} Delta of member changes.
    */
    applyRule: function(){
      var sourceMap = this.sourceMap_;
      var memberMap = this.members_;
      var curMember;
      var newMember;
      var curMemberId;
      var newMemberId;
      var sourceObject;
      var sourceObjectInfo;
      var inserted = [];
      var deleted = [];
      var delta;

      for (var sourceObjectId in sourceMap)
      {
        sourceObjectInfo = sourceMap[sourceObjectId];
        sourceObject = sourceObjectInfo.sourceObject;

        curMember = sourceObjectInfo.member;
        newMember = this.map ? this.map(sourceObject) : sourceObject;

        if (newMember instanceof DataObject == false || this.reduce(newMember))
          newMember = null;

        if (curMember != newMember)
        {
          sourceObjectInfo.member = newMember;

          // if here is ref for member already
          if (curMember)
          {
            curMemberId = curMember.eventObjectId;

            // call callback on member ref add
            if (this.removeMemberRef)
              this.removeMemberRef(curMember, sourceObject);

            // decrease ref count
            memberMap[curMemberId]--;
          }

          // if new member exists, update map
          if (newMember)
          {
            newMemberId = newMember.eventObjectId;

            // call callback on member ref add
            if (this.addMemberRef)
              this.addMemberRef(newMember, sourceObject);

            if (newMemberId in memberMap)
            {
              // member is already in map -> increase ref count
              memberMap[newMemberId]++;
            }
            else
            {
              // add to map
              memberMap[newMemberId] = 1;

              // add to delta
              inserted.push(newMember);
            }
          }
        }
      }

      // get deleted delta
      for (var curMemberId in this.items_)
        if (memberMap[curMemberId] == 0)
        {
          delete memberMap[curMemberId];
          deleted.push(this.items_[curMemberId]);
        }

      // if any changes, fire event
      if (delta = getDelta(inserted, deleted))
        this.event_itemsChanged(delta);

      return delta;
    }
  });


  //
  // Subset
  //

 /**
  * @class
  */
  var Subset = Class(MapReduce, {
    className: namespace + '.Subset',

   /**
    * @inheritDoc
    */
    reduce: function(object){
      return !this.rule(object);
    }
  });


  //
  // Split
  //

 /**
  * @class
  */
  var Split = Class(MapReduce, {
    className: namespace + '.Split',

   /**
    * @type {basis.data.AbstractDataset}
    */
    subsetClass: AbstractDataset,

   /**
    * @type {basis.data.KeyObjectMap}
    */
    keyMap: null,

   /**
    * @inheritDoc
    */
    map: function(sourceObject){
      return this.keyMap.resolve(sourceObject);
    },

    /**
    * @inheritDoc
    */
    setRule: function(rule){
      if (typeof rule != 'function')
        rule = $true;

      if (this.rule !== rule)
      {
        this.rule = rule;
        this.keyMap.keyGetter = rule;
        return this.applyRule();
      }
    },

   /**
    * @inheritDoc
    */
    addMemberRef: function(subset, sourceObject){
      subset.event_itemsChanged({ inserted: [sourceObject] });
    },

   /**
    * @inheritDoc
    */
    removeMemberRef: function(subset, sourceObject){
      subset.event_itemsChanged({ deleted: [sourceObject] });
    },

   /**
    * @constructor
    */ 
    init: function(){
      if (!this.keyMap || this.keyMap instanceof KeyObjectMap == false)
        this.keyMap = new KeyObjectMap(extend({
          keyGetter: this.rule,
          itemClass: this.subsetClass
        }, this.keyMap));

      // inherit
      MapReduce.prototype.init.call(this);
    },

   /**
    * Fetch subset dataset by some data.
    * @param {basis.data.DataObject|Object} data
    * @param {boolean} autocreate
    * @return {basis.data.DataObject}
    */
    getSubset: function(data, autocreate){
      return this.keyMap.get(data, autocreate);
    },

   /**
    * @inheritDoc
    */
    destroy: function(){
      // inherit
      MapReduce.prototype.destroy.call(this);

      // destroy keyMap
      this.keyMap.destroy();
      this.keyMap = null;
    }
  });


  //
  // Slice
  //

  function binarySearchPos(array, map){ 
    if (!array.length)  // empty array check
      return 0;

    var pos;
    var id = map.object.eventObjectId;
    var value = map.value || 0;
    var cmpValue;
    var cmpId;
    var item;
    var l = 0;
    var r = array.length - 1;

    do 
    {
      pos = (l + r) >> 1;

      item = array[pos];
      cmpValue = item.value;

      if (cmpValue === value)
      {
        cmpId = item.object.eventObjectId;
        if (id < cmpId)
          r = pos - 1;
        else 
          if (id > cmpId)
            l = pos + 1;
          else
            return id == cmpId ? pos : 0;  
      }
      else
      {
        if (value < cmpValue)
          r = pos - 1;
        else 
          if (value > cmpValue)
            l = pos + 1;
          else
            return value == cmpValue ? pos : 0;  
      }
    }
    while (l <= r);

    return pos + (cmpValue < value);
  }

  var SLICE_SOURCEOBJECT_UPDATE = function(sourceObject){
    var sourceObjectInfo = this.sourceMap_[sourceObject.eventObjectId];
    var newValue = this.rule(sourceObject);
    var index_ = this.index_;

    if (newValue !== sourceObjectInfo.value)
    {
      index_.splice(binarySearchPos(index_, sourceObjectInfo), 1);
      sourceObjectInfo.value = newValue;
      index_.splice(binarySearchPos(index_, sourceObjectInfo), 0, sourceObjectInfo);
      this.applyRule();
    }
  };

  function sliceIndexSort(a, b){
    return +(a.value > b.value)
        || -(a.value < b.value)
        ||  (a.object.eventObjectId - b.object.eventObjectId);
  }

  var SLICE_SOURCE_HANDLER = {
    itemsChanged: function(source, delta){
      var sourceMap = this.sourceMap_;
      var index = this.index_;
      var updateHandler = this.ruleEvents;
      var dropIndex = false;
      var buildIndex = false;
      var sourceObjectInfo;
      var sourceObjectId;
      var inserted = delta.inserted;
      var deleted = delta.deleted;

      //var d = new Date;
      //console.profile();
     
      // delete comes first to reduce index size -> insert will be faster
      if (deleted)
      {
        // opitimization: if delete item count greater than items left -> rebuild index
        if (deleted.length > index.length - deleted.length)
        {
          dropIndex = true;
          buildIndex = deleted.length != index.length;
          index.length = 0;
        }

        for (var i = 0, sourceObject; sourceObject = deleted[i]; i++)
        {
          if (!dropIndex)
          {
            sourceObjectInfo = sourceMap[sourceObject.eventObjectId];
            index.splice(binarySearchPos(index, sourceObjectInfo), 1);
          }

          delete sourceMap[sourceObject.eventObjectId];

          if (updateHandler)
            sourceObject.removeHandler(updateHandler, this);
        }

        if (buildIndex)
          for (var key in sourceMap)
          {
            sourceObjectInfo = sourceMap[key];
            index.splice(binarySearchPos(index, sourceObjectInfo), 0, sourceObjectInfo);
          }
      }

      if (inserted)
      {
        // optimization: it makes webkit & gecko slower (depends on object count, up to 2x), but makes ie faster
        buildIndex = !index.length;

        for (var i = 0, sourceObject; sourceObject = inserted[i]; i++)
        {
          sourceObjectInfo = {
            object: sourceObject,
            value: this.rule(sourceObject)
          };
          sourceMap[sourceObject.eventObjectId] = sourceObjectInfo;

          if (!buildIndex)
            index.splice(binarySearchPos(index, sourceObjectInfo), 0, sourceObjectInfo);
          else
            index.push(sourceObjectInfo);

          if (updateHandler)
            sourceObject.addHandler(updateHandler, this);
        }

        if (buildIndex)
          index.sort(sliceIndexSort);
      }

      //console.profileEnd();
      //console.log('Slice: ', new Date - d, buildIndex);

      this.applyRule();
    }
  };

 /**
  * @see ./demo/graph/range.html
  * @class
  */
  var Slice = Class(AbstractDataset, SourceDatasetMixin, {
    className: namespace + '.Slice',

   /**
    * Ordering items function.
    * @type {function(basis.data.DataObject)}
    * @readonly
    */
    rule: Function.getter($true),

   /**
    * Events list when dataset should recompute rule for source item.
    */
    ruleEvents: oneFunctionProperty(
      SLICE_SOURCEOBJECT_UPDATE,
      {
        update: true
      }
    ),

   /**
    * Calculated source object values
    * @type {Array.<basis.data.DataSource>}
    * @private
    */
    index_: null,

   /**
    * Direction of range.
    * @type {boolean}
    * @readonly
    */
    orderDesc: false,

   /**
    * Start of range.
    * @type {number}
    * @readonly
    */
    offset: 0,

   /**
    * Length of range.
    * @type {number}
    * @readonly
    */
    limit: 10,

   /**
    * @inheritDoc
    */
    listen: {
      source: SLICE_SOURCE_HANDLER
    },

   /**
    * @event
    */
    event_rangeChanged: createEvent('rangeChanged', 'oldOffset', 'oldLimit'),

   /**
    * @config {function} index Function for index value calculation; values are ordering according to this values.
    * @config {number} offset Initial value of range start.
    * @config {number} limit Initial value of range length.
    * @constructor
    */
    init: function(){
      this.index_ = [];

      // inherit
      SourceDatasetMixin.init.call(this);
    },

   /**
    * Set new range for dataset.
    * @param {number} offset Start of range.
    * @param {number} limit Length of range.
    * @return {Object} Delta of member changes.
    */
    setRange: function(offset, limit){
      var oldOffset = this.offset;
      var oldLimit = this.limit;
      var delta = false;

      if (oldOffset != offset || oldLimit != limit)
      {
        this.offset = offset;
        this.limit = limit;

        delta = this.applyRule();

        this.event_rangeChanged(oldOffset, oldLimit);
      }
    },

   /**
    * Set new value for offset.
    * @param {number} offset
    * @return {Object} Delta of member changes.
    */
    setOffset: function(offset){
      return this.setRange(offset, this.limit);
    },

   /**
    * Set new value for limit.
    * @param {number} limit
    * @return {Object} Delta of member changes.
    */
    setLimit: function(limit){
      return this.setRange(this.offset, limit);
    },

   /**
    * Recompute slice.
    * @return {Object} Delta of member changes.
    */
    applyRule: function(){
      var start = this.offset;
      var end = start + this.limit;

      if (this.orderDesc)
      {
        start = this.index_.length - end;
        end = start + this.limit;
      }

      var curSet = Object.slice(this.items_);
      var newSet = this.index_.slice(Math.max(0, start), Math.max(0, end));
      var inserted = [];
      var delta;

      for (var i = 0, item; item = newSet[i]; i++)
      {
        var objectId = item.object.eventObjectId;
        if (curSet[objectId])
          delete curSet[objectId];
        else
          inserted.push(item.object);
      }

      if (delta = getDelta(inserted, values(curSet)))
        this.event_itemsChanged(delta);

      return delta;
    },

   /**
    * @inheritDoc
    */
    destroy: function(){
      // inherit
      SourceDatasetMixin.destroy.call(this);

      // destroy index
      this.index_ = null;
    }
  });


  //
  // Cloud
  //

  var CLOUD_SOURCEOBJECT_UPDATE = function(sourceObject){
    var sourceMap = this.sourceMap_;
    var memberMap = this.members_;
    var sourceObjectId = sourceObject.eventObjectId;

    var oldList = sourceMap[sourceObjectId].list;
    var newList = sourceMap[sourceObjectId].list = {};
    var list = this.rule(sourceObject);
    var delta;
    var inserted = [];
    var deleted = [];
    var subset;

    if (Array.isArray(list))
      for (var j = 0; j < list.length; j++)
      {
        subset = this.keyMap.resolve(list[j]);

        if (subset)
        {
          subsetId = subset.eventObjectId;
          newList[subsetId] = subset;

          if (!oldList[subsetId])
          {
            subset.event_itemsChanged({ inserted: [sourceObject] });

            if (!memberMap[subsetId])
            {
              inserted.push(subset);
              memberMap[subsetId] = 1;
            }
            else
              memberMap[subsetId]++;
          }
        }
      }
      

    for (var subsetId in oldList)
      if (!newList[subsetId])
      {
        var subset = oldList[subsetId];
        subset.event_itemsChanged({ deleted: [sourceObject] });

        if (!--memberMap[subsetId])
        {
          delete memberMap[subsetId];
          deleted.push(subset);
        }
      }

    if (delta = getDelta(inserted, deleted))
      this.event_itemsChanged(delta);
  };

  var CLOUD_SOURCE_HANDLER = {
    itemsChanged: function(dataset, delta){
      var sourceMap = this.sourceMap_;
      var memberMap = this.members_;
      var updateHandler = this.ruleEvents;
      var objectInfo;
      var array;
      var subset;
      var subsetId;
      var inserted = [];
      var deleted = [];

      Dataset.setAccumulateState(true);

      if (array = delta.inserted)
        for (var i = 0, sourceObject; sourceObject = array[i]; i++)
        {
          var list = this.rule(sourceObject);
          var sourceObjectInfo = {
            object: sourceObject,
            list: {}
          };

          sourceMap[sourceObject.eventObjectId] = sourceObjectInfo;

          if (Array.isArray(list))
            for (var j = 0; j < list.length; j++)
            {
              subset = this.keyMap.get(list[j], true);

              if (subset && !subset.has(sourceObject))
              {
                subsetId = subset.eventObjectId;
                sourceObjectInfo.list[subsetId] = subset;

                subset.event_itemsChanged({ inserted: [sourceObject] });

                if (!memberMap[subsetId])
                {
                  inserted.push(subset);
                  memberMap[subsetId] = 1;
                }
                else
                  memberMap[subsetId]++;
              }
            }

          if (updateHandler)
            sourceObject.addHandler(updateHandler, this);
        }

      if (array = delta.deleted)
        for (var i = 0, sourceObject; sourceObject = array[i]; i++)
        {
          var sourceObjectId = sourceObject.eventObjectId;
          var list = sourceMap[sourceObjectId].list;

          delete sourceMap[sourceObjectId];

          for (var subsetId in list)
          {
            var subset = list[subsetId];
            subset.event_itemsChanged({ deleted: [sourceObject] });

            if (!--memberMap[subsetId])
            {
              delete memberMap[subsetId];
              deleted.push(subset);
            }
          }

          if (updateHandler)
            sourceObject.removeHandler(updateHandler, this);
        }

      Dataset.setAccumulateState(false);

      if (delta = getDelta(inserted, deleted))
        this.event_itemsChanged(delta);
    }
  };

 /**
  * @class
  */
  var Cloud = Class(AbstractDataset, SourceDatasetMixin, {
    className: namespace + '.Cloud',

   /**
    * @type {basis.data.AbstractDataset}
    */
    subsetClass: AbstractDataset,
    
   /**
    * @type {function(basis.data.DataObject)}
    */
    rule: Function.getter($false),

   /**
    * Events list when dataset should recompute rule for source item.
    */
    ruleEvents: oneFunctionProperty(
      CLOUD_SOURCEOBJECT_UPDATE,
      {
        update: true
      }
    ),

   /**
    * @type {basis.data.KeyObjectMap}
    */
    keyMap: null,

   /**
    * @inheritDoc
    */
    map: $self,

   /**
    * @inheritDoc
    */
    listen: {
      source: CLOUD_SOURCE_HANDLER
    },

   /**
    * @constructor
    */ 
    init: function(){
      if (!this.keyMap || this.keyMap instanceof KeyObjectMap == false)
        this.keyMap = new KeyObjectMap(extend({
          keyGetter: this.map,
          itemClass: this.subsetClass
        }, this.keyMap));

      // inherit
      SourceDatasetMixin.init.call(this);
    },

   /**
    * Fetch subset dataset by some data.
    * @param {basis.data.DataObject|Object} data
    * @param {boolean} autocreate
    * @return {basis.data.DataObject}
    */
    getSubset: function(data, autocreate){
      return this.keyMap.get(data, autocreate);
    },

   /**
    * @inheritDoc
    */
    destroy: function(){
      // inherit
      SourceDatasetMixin.destroy.call(this);

      // destroy keyMap
      this.keyMap.destroy();
      this.keyMap = null;
    }
  });


  //
  // export names
  //

  module.exports = {
    // operable datasets
    Merge: Merge,
    Subtract: Subtract,

    // transform datasets
    MapReduce: MapReduce,
    Subset: Subset,
    Split: Split,

    // other
    Slice: Slice,
    Cloud: Cloud
  };
