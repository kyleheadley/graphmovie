//minor
//TODO: combine edge and node code where possible
//TODO: fix weak edge state when re-laying out

/**************/
/* Url Params */
/**************/

//main params
var urlParams;
//constructor for defaults
function setUrlParamDefaults() {
    //file to load on startup
    this.file = null,
    //layout direction: TB, BT, LR, RL
    this.dir = "BT"
}

//this is run during init (from stackoverflow)
function setUrlParams(){
    (window.onpopstate = function () {
    var match,
    pl     = /\+/g,  // Regex for replacing addition symbol with a space
    search = /([^&=]+)=?([^&]*)/g,
    decode = function (s) { return decodeURIComponent(s.replace(pl, " ")); },
    query  = window.location.search.substring(1);

    urlParams = new setUrlParamDefaults();
    while (match = search.exec(query))
        urlParams[decode(match[1])] = decode(match[2]);
    })();
}

/*************/
/* init      */
/*************/

var CHUNK = 0; //skips changes if you select too fast
var SEE_ALL = 1; //every selected change will show (but browser may still skip visual updates)
var CONTROL_MODE = SEE_ALL;

var STATE_NONE = 'nonactive'; //default undeclared element
var STATE_UNKNOWN = 'active'; //default undeclared state

var STATUS_LOADING = 'loading';
var STATUS_WAITING = 'waiting';

var NODE_TEXT_SIZE = 8;

//create global objects
var moviedata = {
    mode: 'all',
    zoom: 1.0,
    width: 400,
    height: 400,
    firstUnLayedOutState: {n:0,e:0,b:0,c:0},
    nodeIds: [],
    nodeViews: [],
    nodeSize: [],
    edgeIds: [],
    edgeViews: [],
    weakEdges: [],
    states: [],
    currentState: {b:-1,c:-1},
    info: ""
}

//create views - currently only a single view
//var stage = $('<div id="stagingDisplay></div>')
var mainGraph = new joint.dia.Graph;

//var stagingGraph = new joint.dia.Graph;
var mainDisplay = new joint.dia.Paper({
    width: 1000,
    height: 1000,
    gridSize: 1,
    model: mainGraph
});

var paperScroller = new joint.ui.PaperScroller({
    paper: mainDisplay,
    autoResizePaper: true
});

mainDisplay.on('blank:pointerdown', paperScroller.startPanning);
paperScroller.$el.css({ width: '100%', height: '100%' }).appendTo('#mainDisplay');

V(mainDisplay.viewport).translate(250, 150);

/*
var stagingDisplay = new joint.dia.Paper({
    el: stage,
    width: 200,
    height: 200,
    gridSize: 1,
    model: stagingGraph
});
*/

/***********/
/* Parsing */
/***********/

var parser = {
    useString: function(data){
        parser.lines = data.split('\n');
        parser.currentLine = 0;
    },
    parseLines: function(){
        var tag, args, title, text;
        var line = parser.lines[parser.currentLine];
        var split = line.indexOf(']');
        var el = line.slice(0,split);
        if(el.charAt(0) == '['){
            args = el.substr(1).split(' ');
            //extract the first element
            tag = args.shift();
            title = line.slice(split+1);
        }else{
            //first line is without tag
            args = [];
            tag = '';
            title = '';
            currentLine = -1;
        }
        //find next line
        var nextLine = parser.currentLine+1;
        while(nextLine<parser.lines.length && parser.lines[nextLine][0]!='[') {
            nextLine++;
        }
        //text is everything between last line and next
        text = parser.lines.slice(parser.currentLine+1,nextLine).join('\n');
        //report
        parser.dispatch(tag, args, title, text);
        //finalize
        parser.currentLine = nextLine;
        //repeat (or not)
        if(parser.currentLine<parser.lines.length){         
            _.delay(parser.parseLines, 1)
        }else{
            loader.finalize();
        }
    },
    dispatch: function(tag, args, title, text){
        switch (tag) {
            case 'styleselect':
                if(args.length == 1) {
                    style.select(args[0]);
                }
                break;
            case 'styleadd':
                if(args.length == 1) {
                    style.create(args[0], title, text);
                }
                break;
            case 'styleappend':
                if(args.length >= 2) {
                    style.create(args[1], title, text, args[0]);
                }else if(args.length == 1){
                    style.create(args[0], title, text, args[0]);
                }
                break;
            case 'state':
                loader.addState(title, text);
                break;
            case 'change':
                loader.addChange(title, text);
                break;
            case 'node':
                if(args.length >= 2){
                    loader.addNode(args[0], args[1], title, text);
                }else if(args.length == 1){
                    loader.addNode(args[0], STATE_UNKNOWN, title, text);
                }
                break;
            case 'edge':
            case 'strongedge':
                if(args.length >= 4){
                    loader.addEdge(args[0], args[1], args[2], args[3], title, text, false);
                }else if(args.length == 3){
                     loader.addEdge(args[0], args[1], '', args[2], title, text, false);
                }else if(args.length == 2){
                     loader.addEdge(args[0], args[1], '', STATE_UNKNOWN, title, text, false);
                }
                break;
            case 'weakedge':
                if(args.length >= 4){
                    loader.addEdge(args[0], args[1], args[2], args[3], title, text, true);
                }else if(args.length == 3){
                     loader.addEdge(args[0], args[1], '', args[2], title, text, true);
                }else if(args.length == 2){
                     loader.addEdge(args[0], args[1], '', STATE_UNKNOWN, title, text, true);
                }
                break;
        }
    }
}

/*******************/
/* Data processing */
/*******************/

var style = {
    inline: {},
    active: [],
    select: function(value) {
        $('#style').val(value);
        handleStyleChange();
    },
    create: function(value, title, text, prev){
        //prev is either undefined or the appended sheet or file name
        if(prev && style.inline[prev]) {
            prev = style.inline[prev];
        }
        //save data
        style.inline[value] = {text: text, prev: prev};
        //modify chooser
        var opt = $('#style option[value='+value+']')
        if(opt.length) {
            //reuse option if available
            opt.text(title);
        }else{
            //create option
            $('#style').append($('<option></option>').val(value).text(title));
        }
    },
}

var loader = {
    currentState: -1,
    currentChange: -1,
    currentNodeStates: [],
    currentEdgeStates: [],
    addState: function(name, info){
        //finalize previous
        if(loader.currentState >= 0){
            moviedata.states[loader.currentState].changes[loader.currentChange].$op.val(STATUS_WAITING).text('Awaiting Layout ...');
        }
        //new
        var newState = {
            nodeStates: [],
            edgeStates: [],
            changes: []
        };
        var firstChange = {
            title: name,
            info: info,
            nodeDiffs: [],
            edgeDiffs: [],
            $op: $('<option></option>')
        };
        //Initialize all known states to 'none'
        loader.currentNodeStates = [];
        for(var i = 0; i<moviedata.nodeIds.length; i++){
            var name = moviedata.nodeIds[i];
            loader.currentNodeStates[i] = {index: i, state: STATE_NONE, name: name, info: ''};
            newState.nodeStates[i] = {index: i, state: STATE_NONE, name: name, info: ''};
        }
        loader.currentEdgeStates = [];
        for(var i = 0; i<moviedata.edgeIds.length; i++){
            var name = moviedata.edgeIds[i].replace(/ /g,'-');
            loader.currentEdgeStates[i] = {index: i, state: STATE_NONE, name: name, info: ''};
            newState.edgeStates[i] = {index: i, state: STATE_NONE, name: name, info: ''};
        }
        //increment
        loader.currentState = moviedata.states.length;
        loader.currentChange = 0;
        //store
        newState.changes.push(firstChange);
        moviedata.states.push(newState);
        //view
        $('#list').append(firstChange.$op.val(STATUS_LOADING).text('Loading ...'));
    },
    addChange: function(name, info){
        //init
        if(loader.currentState == -1) loader.addState("None","");
        var cs = moviedata.states[loader.currentState];
        var oldChange = cs.changes[loader.currentChange];
        //finalize previous
        oldChange.$op.val(STATUS_WAITING).text('Awaiting Layout ...');
        for(var i = 0; i<oldChange.nodeDiffs.length; i++){
            loader.currentNodeStates[oldChange.nodeDiffs[i].index] = oldChange.nodeDiffs[i];
        }
        for(var i = 0; i<oldChange.edgeDiffs.length; i++){
            loader.currentEdgeStates[oldChange.edgeDiffs[i].index] = oldChange.edgeDiffs[i];
        }
        //new
        var newChange = {
            title: name,
            info: info,
            nodeDiffs: [],
            edgeDiffs: [],
            $op: $('<option></option>')
        };
        //each changeset remembers the old changes in this state
        for(var i=0; i<oldChange.nodeDiffs.length; i++){
            var copiedDiff = {
                index: oldChange.nodeDiffs[i].index,
                state: oldChange.nodeDiffs[i].state,
                lastState: oldChange.nodeDiffs[i],
                name: oldChange.nodeDiffs[i].name,
                info: oldChange.nodeDiffs[i].info                
            }
            newChange.nodeDiffs.push(copiedDiff)
        }
        for(var i=0; i<oldChange.edgeDiffs.length; i++){
            var copiedDiff = {
                index: oldChange.edgeDiffs[i].index,
                state: oldChange.edgeDiffs[i].state,
                lastState: oldChange.edgeDiffs[i],
                name: oldChange.edgeDiffs[i].name,
                info: oldChange.edgeDiffs[i].info                
            }
            newChange.edgeDiffs.push(copiedDiff)
        }
        //store
        loader.currentChange = cs.changes.length;
        cs.changes.push(newChange);
        //view
        $('#list').append(newChange.$op.val(STATUS_LOADING).text('Loading ...'));

    },
    finalize: function(){
        if(loader.currentState >= 0){
            moviedata.states[loader.currentState].changes[loader.currentChange].$op.text('Awaiting Layout ...');
        }
        _.delay(loader.layout, 1);
    },
    addNode: function(id, state, name, info){
        //use id for name if it's only whitespace
        if(name.match(/^\s*$/)) name = id;
        //init
        if(loader.currentState == -1) loader.addState("None","");
        var cs = moviedata.states[loader.currentState];
        var cc = cs.changes[loader.currentChange];
        //create
        var nodeIndex = loader.registerNode(id);
        //base type
        if(loader.currentChange == 0){
            cs.nodeStates[nodeIndex] = {
                index: nodeIndex,
                state: state,
                name: name,
                info: info
            };
            loader.currentNodeStates[nodeIndex] = cs.nodeStates[nodeIndex];
        //change type
        }else{
            oldIndex = findObjectIndex(cc.nodeDiffs, nodeIndex);
            var newNode = {
                index: nodeIndex,
                state: state,
                lastState: loader.currentNodeStates[nodeIndex],
                name: name,
                info: info
            }
            if(oldIndex == -1){    
                cc.nodeDiffs.push(newNode);
            }else{
                cc.nodeDiffs[oldIndex] = newNode;
            }
        }
        //update size
        os = moviedata.nodeSize[nodeIndex];
        ns = calcSize(name);
        moviedata.nodeSize[nodeIndex] = {width: _.max([os.width, ns.width]), height: _.max([os.height, ns.height])};
    },
    addEdge: function(from, to, tag, state, name, info, weak){
        //use id for name if it's only whitespace
        if(name.match(/^\s*$/)) name = [from,to,tag].join("-");
        //init
        if(loader.currentState == -1) loader.addState("None","");
        var cs = moviedata.states[loader.currentState];
        var cc = cs.changes[loader.currentChange];
        //create
        var edgeIndex = loader.registerEdge(from, to, tag, weak);
        //base type
        if(loader.currentChange == 0){
            cs.edgeStates[edgeIndex] = {
                index: edgeIndex,
                state: state,
                name: name,
                info: info
            };
            loader.currentEdgeStates[edgeIndex] = cs.edgeStates[edgeIndex];
        //change type
        }else{
            oldIndex = findObjectIndex(cc.edgeDiffs, edgeIndex);
            var newEdge = {
                index: edgeIndex,
                state: state,
                lastState: loader.currentEdgeStates[edgeIndex],
                name: name,
                info: info
            }
            if(oldIndex == -1){    
                cc.edgeDiffs.push(newEdge);
            }else{
                cc.edgeDiffs[oldIndex] = newEdge;
            }
        }
    },
    registerNode: function(id){
        //find node
        var nodeIndex = moviedata.nodeIds.indexOf(id);
        if(nodeIndex == -1){
            //setup node
            nodeIndex = moviedata.nodeIds.length;
            moviedata.nodeIds.push(id);
            //retroactive add
            loader.currentNodeStates[nodeIndex] = {index: nodeIndex, state: STATE_NONE, name: id, info: ''};
            for(var i = 0; i < moviedata.states.length; i++){
                moviedata.states[i].nodeStates[nodeIndex] = {index: nodeIndex, state: STATE_NONE, name: id, info: ''};
            }
            //init size
            moviedata.nodeSize[nodeIndex] = calcSize("min");
            //stage
            moviedata.nodeViews[nodeIndex] = makeElement(id);
            mainGraph.addCell(moviedata.nodeViews[nodeIndex]);
        }

        return nodeIndex;
    },
    registerEdge: function(from, to, tag, weak){
        var id = [from, to, tag].join(' ');
        //set up connected nodes
        var from_id = moviedata.nodeIds.indexOf(from)
        if(from_id == -1 || loader.currentNodeStates[from_id].state == STATE_NONE){        
            loader.addNode(from, STATE_UNKNOWN, from, '')
        }
        var to_id = moviedata.nodeIds.indexOf(to)
        if(to_id == -1 || loader.currentNodeStates[to_id].state == STATE_NONE){        
            loader.addNode(to, STATE_UNKNOWN, to, '')
        }
        //find edge
        var edgeIndex = moviedata.edgeIds.indexOf(id);
        if(edgeIndex == -1){
            //set up edge
            edgeIndex = moviedata.edgeIds.length;
            moviedata.edgeIds.push(id);
            //retroactive add
            var name = id.replace(/ /g,'-');
            loader.currentEdgeStates[edgeIndex] = {index: edgeIndex, state: STATE_NONE, name: name, info: ''};
            for(var i = 0; i < moviedata.states.length; i++){
                moviedata.states[i].edgeStates[edgeIndex] = {index: edgeIndex, state: STATE_NONE, name: name, info: ''};
            }
            //stage
            moviedata.edgeViews[edgeIndex] = makeLink(from, to);
            //weak edges can't be added to the graph before layout
            if(weak) {
                moviedata.weakEdges.push({model: moviedata.edgeViews[edgeIndex], index: edgeIndex});
            } else {
                mainGraph.addCell(moviedata.edgeViews[edgeIndex]);
            }
        }

        return edgeIndex;
    },
    layout: function(){
        var totalStates = moviedata.states.length;
        if(totalStates == 0) return;
        var f = moviedata.firstUnLayedOutState;
        //reset all node sizes
        for(var i=f.n; i<moviedata.nodeSize.length;i++){
            moviedata.nodeViews[i].set('size', moviedata.nodeSize[i]);
        }
        //remove weak edges (they might have been added by a prior call to layout)
        for(var i=0;i<moviedata.weakEdges.length;i++){
            moviedata.weakEdges[i].model.remove();
        }
        //layout
        var size = joint.layout.DirectedGraph.layout(mainGraph, {
            setLinkVertices: false,
            nodeSep: 5,
            rankDir: urlParams["dir"]
        });
        //include weak edges
        for(var i=0;i<moviedata.weakEdges.length;i++){
            var e = moviedata.weakEdges[i];
            mainGraph.addCell(e.model);
            //and re-cache it if necessary
            if(e.index<=f.e) {
                moviedata.edgeViews[e.index] = V(mainDisplay.findViewByModel(e.model).el);
            }
        }
        //cache the view elements
        for(var i=f.n; i<moviedata.nodeViews.length; i++){
            var model = moviedata.nodeViews[i];
            moviedata.nodeViews[i] = V(mainDisplay.findViewByModel(model).el);
        }
        for(i=f.e;i<moviedata.edgeViews.length;i++){
            var model = moviedata.edgeViews[i];
            moviedata.edgeViews[i] = V(mainDisplay.findViewByModel(model).el);
        }
        //set paper size with extra space for repositioning
        moviedata.height = size.height + window.innerHeight;
        moviedata.width = size.width + window.innerWidth;
        adjustPaper();
        //setup '#list'
        var first = f.b-1;
        if (first == -1) first = 0;
        for(var i=first; i<moviedata.states.length; i++){
            for(var j=0; j<moviedata.states[i].changes.length; j++){
                var state = moviedata.states[i].changes[j];
                state.$op.val(i+'c'+j).text(state.title);
            }
        }
        //setup first states
        if(f.b == 0 && f.c == 0){
            moviedata.info = titleInfoText(moviedata.states[0].changes[0]);
            for(var i=0;i<moviedata.nodeViews.length;i++){
                moviedata.nodeViews[i].addClass(moviedata.states[0].nodeStates[i].state);
                moviedata.info += nodeInfoText(moviedata.states[0].nodeStates[i],i)
                //add names
                //moviedata.nodeViews[i].findOne("text").text(moviedata.states[0].nodeStates[i].name);
            }
            for(var i=0;i<moviedata.edgeViews.length;i++){
                moviedata.edgeViews[i].addClass(moviedata.states[0].edgeStates[i].state);
                moviedata.info += edgeInfoText(moviedata.states[0].edgeStates[i],i)
            }
            $('#infobox').html(moviedata.info);
            //select the first state
            var bs = 0, cs = 0;
            if(window.location.hash) {
                var ss =  window.location.hash.substring(1).split('c');
                bs = parseInt(ss[0]);
                cs = parseInt(ss[1]);
                if(bs<0 || bs>=moviedata.states.length ||
                   cs<0 && cs>=moviedata.states[bs].changes.length) {
                    bs = 0;
                    cs = 0;
                }
            }
            moviedata.currentState = {b:0,c:0};
            $('#list').val(bs+'c'+cs);
            window.location.hash = '#'+bs+'c'+cs;
        }
        //increment current layout position
        moviedata.firstUnLayedOutState = {
            n: moviedata.nodeIds.length,
            e: moviedata.edgeIds.length,
            b: moviedata.states.length,
            c: moviedata.states[moviedata.states.length-1].changes.length
        }
        //allow user to use arrow keys without clicking
        $('#list').focus();
    }

}

/*****************/
/* file handling */
/*****************/
//handler for new file selection
function loadFile(file) {
    //explicitly loaded files should start at the beginning
    window.location.hash = '';
    //read file
    var reader = new FileReader();
    reader.onload = function(e) {
        //clear view
        resetData();
        generateMovie(e.target.result);
    }
    if(file) reader.readAsText(file);
}

function generateMovie(logText){
        $('#list').empty();
        //prep parser
        parser.useString(logText)
        //parse data
        parser.parseLines();
        //currently data displayed automatically at completion of parse
}

/***********/
/* Visuals */
/***********/
function refreshGraph(baseState, changeState){
    //non-cases
    if(baseState == -1 || isNaN(baseState)) return;
    if(baseState == moviedata.currentState.b &&
        changeState == moviedata.currentState.c) return;

    var oldBase = moviedata.currentState.b;
    var oldChange = moviedata.currentState.c;
    
    moviedata.info = titleInfoText(moviedata.states[baseState].changes[changeState]);

    // +1 within the same base state (for speed)
    if(oldBase == baseState && oldChange+1 == changeState && changeState>1){
        for(var cs=oldChange+1;cs<=changeState;cs++){
            var ncs = moviedata.states[baseState].changes[cs].nodeDiffs
            for(var n=0;n<ncs.length;n++){
                //set states
                if(ncs[n].state != ncs[n].lastState.state){
                    moviedata.nodeViews[ncs[n].index].removeClass(ncs[n].lastState.state).addClass(ncs[n].state);
                    //set info on state change
                    moviedata.info += nodeInfoText(ncs[n]);
                }else if(ncs[n].info != ncs[n].lastState.info || ncs[n].name != ncs[n].lastState.name) {
                    //set info on info change
                    moviedata.info += nodeInfoText(ncs[n]);
                }
                //moviedata.nodeViews[ncs[n].index].findOne("text").text(ncs[n].name);
            }
            var ecs = moviedata.states[baseState].changes[cs].edgeDiffs
            for(var e=0;e<ecs.length;e++){
                if(ecs[e].state != ecs[e].lastState.state){
                    moviedata.edgeViews[ecs[e].index].removeClass(ecs[e].lastState.state).addClass(ecs[e].state);
                    moviedata.info += edgeInfoText(ecs[e]);
                }else if(ecs[e].info != ecs[e].lastState.info || ecs[e].name != ecs[e].lastState.name) {
                    moviedata.info += edgeInfoText(ecs[e]);
                }
            }
        }
    // -1 within same state
    }else if(oldBase == baseState && oldChange-1 == changeState && changeState>0) {
        var cs = changeState;
        //it's the old one (the following one) that has the data for both states
        var oncs = moviedata.states[baseState].changes[cs+1].nodeDiffs
        for(var n=0;n<oncs.length;n++){
            //set states
            if(oncs[n].state != oncs[n].lastState.state){
                moviedata.nodeViews[oncs[n].lastState.index].removeClass(oncs[n].state).addClass(oncs[n].lastState.state);
                //set info on state change
                moviedata.info += nodeInfoText(oncs[n].lastState);
            }else if(oncs[n].info != oncs[n].lastState.info || oncs[n].name != oncs[n].lastState.name) {
                //set info on info change
                moviedata.info += nodeInfoText(oncs[n].lastState);
            }
            //moviedata.nodeViews[ncs[n].index].findOne("text").text(ncs[n].name);
        }
        var oecs = moviedata.states[baseState].changes[cs+1].edgeDiffs
        for(var e=0;e<oecs.length;e++){
            if(oecs[e].state != oecs[e].lastState.state){
                moviedata.edgeViews[oecs[e].lastState.index].removeClass(oecs[e].state).addClass(oecs[e].lastState.state);
                moviedata.info += edgeInfoText(oecs[e].lastState);
            }else if(oecs[e].info != oecs[e].lastState.info || oecs[e].name != oecs[e].lastState.name) {
                moviedata.info += edgeInfoText(oecs[e].lastState);
            }
        }
    //arbitrary change of states
    }else{
        var nodechangelist = [];
        var edgechangelist = [];
        //change the state of all changed objects to their base state
        var cc = moviedata.states[oldBase].changes[oldChange];
        for(var i=0;i<cc.nodeDiffs.length;i++){
            var diff = cc.nodeDiffs[i]
            var ns = moviedata.states[oldBase].nodeStates[diff.index].state;
            if(moviedata.mode == 'diff') ns = STATE_NONE;
            if(ns != diff.state){
                var thischange = {};
                if(nodechangelist[diff.index] === undefined) {
                    thischange.oldstate = diff.state;
                }else{
                    thischange.oldstate = nodechangelist[diff.index].oldstate;
                }
                thischange.newstate = ns;
                nodechangelist[diff.index]=thischange;
            }
            //TODO: change name
        }
        for(var i=0;i<cc.edgeDiffs.length;i++){
            var diff = cc.edgeDiffs[i]
            var ns = moviedata.states[oldBase].edgeStates[diff.index].state;
            if(moviedata.mode == 'diff') ns = STATE_NONE;
            if(ns != diff.state){
                var thischange = {};
                if(edgechangelist[diff.index] === undefined) {
                    thischange.oldstate = diff.state;
                }else{
                    thischange.oldstate = edgechangelist[diff.index].oldstate;
                }
                thischange.newstate = ns;
                edgechangelist[diff.index]=thischange;
            }
        }
        //change all the objects to the new base state
        for(var i=0; i<moviedata.nodeIds.length; i++){
            var os = moviedata.states[oldBase].nodeStates[i].state;
            var ns = moviedata.states[baseState].nodeStates[i].state;
            if(moviedata.mode == 'diff') ns = STATE_NONE;
            if(ns != os){
                var thischange = {};
                if(nodechangelist[i] === undefined) {
                    thischange.oldstate = os;
                }else{
                    thischange.oldstate = nodechangelist[i].oldstate;
                }
                thischange.newstate = ns;
                nodechangelist[i]=thischange;
            }
            //TODO: change name
        }
        for(var i=0; i<moviedata.edgeIds.length; i++){
            var os = moviedata.states[oldBase].edgeStates[i].state;
            var ns = moviedata.states[baseState].edgeStates[i].state;
            if(moviedata.mode == 'diff') ns = STATE_NONE;
            if(ns != os){
                var thischange = {};
                if(edgechangelist[i] === undefined) {
                    thischange.oldstate = os;
                }else{
                    thischange.oldstate = edgechangelist[i].oldstate;
                }
                thischange.newstate = ns;
                edgechangelist[i]=thischange;
            }
        }
        var bs = moviedata.states[baseState];
        var nc = bs.changes[changeState];
        //add the new changes
        if(changeState == 0){
            ns = bs.nodeStates;
            es = bs.edgeStates;
            //set info with all base items
            for(i=0;i<ns.length;i++){
                moviedata.info += nodeInfoText(ns[i], i);
            }
            for(i=0;i<es.length;i++){
                moviedata.info += edgeInfoText(es[i], i);
            }
        }
        for(i=0;i<nc.nodeDiffs.length;i++){
            var diff = nc.nodeDiffs[i]
            var os = moviedata.states[baseState].nodeStates[diff.index].state;
            if(os != diff.state){
                var thischange = {};
                if(nodechangelist[diff.index] === undefined) {
                    thischange.oldstate = os;
                }else{
                    thischange.oldstate = nodechangelist[diff.index].oldstate;
                }
                thischange.newstate = diff.state;
                nodechangelist[diff.index]=thischange;
            }
            if(diff.state != diff.lastState.state || diff.info != diff.lastState.info || diff.name != diff.lastState.name) {
                //set info on info change from previous movie state
                moviedata.info += nodeInfoText(diff);
            }
            //TODO: change name
        }
        for(i=0;i<nc.edgeDiffs.length;i++){
            var diff = nc.edgeDiffs[i]
            var os = moviedata.states[baseState].edgeStates[diff.index].state;
            if(os != diff.state){
                var thischange = {};
                if(edgechangelist[diff.index] === undefined) {
                    thischange.oldstate = os;
                }else{
                    thischange.oldstate = edgechangelist[diff.index].oldstate;
                }
                thischange.newstate = diff.state;
                edgechangelist[diff.index]=thischange;
            }
            if(diff.state != diff.lastState.state || diff.info != diff.lastState.info || diff.name != diff.lastState.name) {
                //set info on info change from previous movie state
                moviedata.info += edgeInfoText(diff);
            }
        }
        //do the changes
        for(i=0;i<moviedata.nodeViews.length;i++) {
            if(nodechangelist[i]) {
                moviedata.nodeViews[i].removeClass(nodechangelist[i].oldstate).addClass(nodechangelist[i].newstate);
            }
        }
        for(i=0;i<moviedata.edgeViews.length;i++) {
            if(edgechangelist[i]) {
                moviedata.edgeViews[i].removeClass(edgechangelist[i].oldstate).addClass(edgechangelist[i].newstate);
            }
        }
    }
    //set current state
    $('#infobox').html(moviedata.info);
    moviedata.currentState.b = baseState;
    moviedata.currentState.c = changeState;
}

/********************/
/* Control Handling */
/********************/
function init(){
    //set the change handlers
    $('#file').change(handleFileSelect);
    $('#list').change(handleListSelect);
    $('#mode').change(handleModeChange);
    $('#zoomnum').change(handleZoomText);
    $('#style').change(handleStyleChange);
    $('#dolayout').on("click", loader.layout);
    //url data
    setUrlParams();
    window.onhashchange = handleHashChange;
    //initial css load
    handleStyleChange();
    //load url if supplied
    if(urlParams.file != null) {   
        $.get(urlParams["file"], generateMovie)
    }
 
}

function handleHashChange() {
    var hash = window.location.hash.substring(1).split('c');
    var bs = parseInt(hash[0]);
    var cs = parseInt(hash[1]);

    if(isNaN(bs)||isNaN(cs)||bs<0) return;

    //check to see if the list select has already handled the change
    if(CONTROL_MODE == SEE_ALL) if($('#list').val() == bs+'c'+cs) return;

    //math to allow more flexibility in hashes, ie 2c-3
    var maxcs = moviedata.states[bs].changes.length;
    while(cs >= maxcs) {
        cs -= maxcs;
        bs += 1;
        if(bs>=moviedata.states.length) return;
        maxcs = moviedata.states[bs].changes.length;
    }
    while(cs < 0) {
        if(bs<=0) return;
        cs += moviedata.states[bs-1].changes.length;
        bs -= 1;
    }
    //set the list box selection (without event) and change the graph
    $('#list').val(bs+'c'+cs);
    selectionChanged(bs,cs);
}

function handleFileSelect(event) {
    var files = event.target.files;
    var f = files[0];
    loadFile(f);
    //allow user to use arrow keys without clicking
    $('#list').focus();
}

function handleListSelect(event){
    var ss = event.target.value.split('c');
    var bs = parseInt(ss[0]);
    var cs = parseInt(ss[1]);
    if(moviedata.mode == 'no-change'){
        oldcs = moviedata.currentState.c;
        oldbs = moviedata.currentState.b;
        if(oldbs == bs){
            //'down' in same state
            if(oldcs < cs){
                if(bs < moviedata.states.length-1){            
                    bs += 1;
                }
            //'up' in same state
            }else if(oldcs > cs){
                if(bs > 0){            
                    bs -= 1;
                }
            }
        }
        //in different state: just back up to state
        cs = 0;
        $('#list').val(bs+"c"+cs);
    }
    window.location.hash = '#'+bs+'c'+cs;
    if(CONTROL_MODE == SEE_ALL) selectionChanged(bs, cs);
}

function selectionChanged(bs, cs) {
    refreshGraph(bs, cs);
}

function handleModeChange(event) {
    var opt = $('#list option:selected').val();
    if(!opt) return;
    var ss = opt.split('c');
    var bs = parseInt(ss[0]);
    var cs = parseInt(ss[1]);

    moviedata.mode = event.target.value;
    refreshGraph(bs,cs);
    //allow user to use arrow keys without clicking
    $('#list').focus();
}

function handleZoomText(event){
    moviedata.zoom = parseFloat(event.target.value)/100;
    adjustPaper();
    //allow user to use arrow keys without clicking
    $('#list').focus();
}

function handleStyleChange(){
    var selectedStyle = $('#style option:selected').val()
    //destroy last selection
    if(style.active.length){
        _.each(style.active, (function(e){e.parentNode.removeChild(e)}));
        style.active = [];
    }else{
        $('#csschoice').prop('href','');
    }
    //choose between style from file or one from loaded graph (default)
    var setupsheet; //recursive
    (setupsheet = function(s) {
        //need to accept the string reference or the object it refers to
        var so = s;
        if(typeof so === "string") so = style.inline[s];
        if(so){
            //load previous sheets first to cascade (append) properly
            if(so.prev) setupsheet(so.prev);
            //modified from SO: http://stackoverflow.com/qdocument.addStyle= function(str, hoo, med){
            var str = so.text;
            var el= document.createElement('style');
            el.type= "text/css";
            el.media= 'screen';
            el.title= "internal style";
            if(el.styleSheet)
                el.styleSheet.cssText= str;//IE only
            else
                el.appendChild(document.createTextNode(str));
            style.active.push(document.getElementsByTagName('head')[0].appendChild(el));
        }else{
            $('#csschoice').prop('href','css/'+s+'.css');     
        }
    })(selectedStyle);

    //jump back to state list
    $('#list').focus();
}

/***********/
/* Helpers */
/***********/
function adjustPaper(){
    var h = moviedata.height;
    var w = moviedata.width;
    var z = moviedata.zoom;
    V(mainDisplay.viewport).scale(z,z);
    mainDisplay.setDimensions(w*z*1.5,h*z*1.5);
}

function resetData(){
    //clear main data object
    moviedata.firstUnLayedOutState = {n:0,e:0,b:0,c:0};
    moviedata.nodeIds = [];
    moviedata.nodeViews = [];
    moviedata.nodeSize = [];
    moviedata.edgeIds = [];
    moviedata.edgeViews = [];
    moviedata.weakEdges = [];
    moviedata.states = [];
    moviedata.currentState = {b:-1,c:-1};

    //clear loader data
    loader.currentState = -1;
    loader.currentChange = -1;
    loader.currentNodeStates = [];
    loader.currentEdgeStates = [];

    //clear graph object
    mainGraph.resetCells();
}

function makeLink(parentElementLabel, childElementLabel) {
    var link = new joint.dia.Link({
        source: { id: parentElementLabel },
        target: { id: childElementLabel },
        attrs: { '.marker-target': { d: 'M 4 0 L 0 2 L 4 4 z' } },
        smooth: true
    });
    return link;
}
function calcSize(label) {
    var lines = label.split('\n');
    var maxLineLength = _.max(lines, function(l) { return l.length; }).length;
    // Compute width/height of the rectangle based on the number
    // of lines in the label and the letter size. 0.6 * letterSize is
    // an approximation of the monospace font letter width.
    var width = (NODE_TEXT_SIZE * (0.6 * maxLineLength + 1));
    var height = 3 * NODE_TEXT_SIZE;
    return {width: width, height: height};

}

function makeElement(label) {
    var s = calcSize(label);
    var element = new joint.shapes.basic.Rect({
        id: label,
        size: { width: s.width, height: s.height },
        attrs: {
            text: {
                text: label,
                'font-size': NODE_TEXT_SIZE,
                'font-family': 'monospace',
                'transform': ''
            },
            rect: {
                width: s.width, height: s.height,
                rx: 5, ry: 5,
                stroke: '#555'
            }
        }
    });
    return element;
}

function findObjectIndex(arr, index){
    var ret = -1;
    for(var i=0; i<arr.length; i++){
        if(arr[i].index == index) {
            ret = i;
            break;
        } 
    }
    return ret;
}

function nodeInfoText(item, index) {
    //index is optional because some items don't have an index
    if(typeof index === "undefined") index = item.index;
    //get useful name
    var name = item.name;
    if(name == "") name = "node "+ moviedata.nodeIds[index];

    var info = "<b>"+name+"</b>: "+item.state+"<br />";
    //turn newlines into breaks
    if(item.info != ""){
        //turn newlines into breaks
        info += item.info.replace(/(?:\r\n|\r|\n)/g, '<br />')+"<br />";
    }
    return info;
}

function edgeInfoText(item, index) {
    //index is optional because some items don't have an index
    if(typeof index === "undefined") index = item.index;
    //get useful name
    var name = item.name;
    if(name == "") name = "edge "+ moviedata.edgeIds[index].replace(/ /g ,"-");

    var info = "<b>"+name+"</b>: "+item.state+"<br />";
    if(item.info != ""){
        //turn newlines into breaks
        info += item.info.replace(/(?:\r\n|\r|\n)/g, '<br />')+"<br />";
    }
    return info;
}

function titleInfoText(item) {
    if(item.info == "") return "";
    return "<i>"+item.info.replace(/(?:\r\n|\r|\n)/g, '<br />')+"</i><br />"
}

//start up everything
$( document ).ready(init);


