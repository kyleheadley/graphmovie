//major
//TODO: write style.add()
//TODO: add titles as names

//minor
//TODO: combine edge and node code where possible

//future
//TODO: bind the external layout with the internal layout

/*************/
/* init      */
/*************/

//this is the only way I could get the layout the way I wanted it...
var LEFT_CONTROL_BAR_WIDTH = 250;
var TOP_CONTROL_BAR_HEIGHT = 30;

var STATE_NONE = 'nonactive'; //default undeclared element
var STATE_UNKNOWN = 'active'; //default undeclared state

var STATUS_LOADING = 'loading';
var STATUS_WAITING = 'waiting';

var NODE_TEXT_SIZE = 8;

$( document ).ready(init);

//create global objects
var moviedata = {
    mode: 'all',
    zoom: 0.5,
    width: 400,
    height: 400,
    firstUnLayedOutState: 0,
    nodeIds: [],
    nodeViews: [],
    nodeSize: [],
    edgeIds: [],
    edgeViews: [],
    states: [],
    currentState: {b:-1,c:-1}
}

//create views - currently only a single view
//var stage = $('<div id="stagingDisplay></div>')
var mainGraph = new joint.dia.Graph;
//var stagingGraph = new joint.dia.Graph;
var mainDisplay = new joint.dia.Paper({
    el: $('#mainDisplay'),
    width: 200,
    height: 200,
    gridSize: 1,
    model: mainGraph
});
/*
var stagingDisplay = new joint.dia.Paper({
    el: stage,
    width: 200,
    height: 200,
    gridSize: 1,
    model: stagingGraph
});
*/

//move the paper out from under the controls
V(mainDisplay.viewport).translate(LEFT_CONTROL_BAR_WIDTH + 2, TOP_CONTROL_BAR_HEIGHT + 2)

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
            _.delay(parser.parseLines, 50)
        }else{
            loader.finalize();
        }
    },
    dispatch: function(tag, args, title, text){
        switch (tag) {
            case 'style':
                style.add(args[0], title, text);
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
                if(args.length >= 4){
                    loader.addEdge(args[0], args[1], args[2], args[3], title, text);
                }else if(args.length == 3){
                     loader.addEdge(args[0], args[1], '', args[3], title, text);
                }else if(args.length == 2){
                     loader.addEdge(args[0], args[1], '', STATE_UNKNOWN, title, text);
                }
                break;
        }
    }
}

/*******************/
/* Data processing */
/*******************/

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
            loader.currentNodeStates[i] = STATE_NONE;
            newState.nodeStates[i] = {state: STATE_NONE, name: '', info: ''};
        }
        loader.currentEdgeStates = [];
        for(var i = 0; i<moviedata.edgeIds.length; i++){
            loader.currentEdgeStates[i] = STATE_NONE;
            newState.edgeStates[i] = {state: STATE_NONE, name: '', info: ''};
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
            loader.currentNodeStates[oldChange.nodeDiffs[i].index] = oldChange.nodeDiffs[i].state;
        }
        for(var i = 0; i<oldChange.edgeDiffs.length; i++){
            loader.currentEdgeStates[oldChange.edgeDiffs[i].index] = oldChange.edgeDiffs[i].state;
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
                lastState: oldChange.nodeDiffs[i].state,
                name: oldChange.nodeDiffs[i].name,
                info: oldChange.nodeDiffs[i].info                
            }
            newChange.nodeDiffs.push(copiedDiff)
        }
        for(var i=0; i<oldChange.edgeDiffs.length; i++){
            var copiedDiff = {
                index: oldChange.edgeDiffs[i].index,
                state: oldChange.edgeDiffs[i].state,
                lastState: oldChange.edgeDiffs[i].state,
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
        _.delay(loader.layout, 50);
    },
    addNode: function(id, state, name, info){
        //init
        if(loader.currentState == -1) loader.addState("None","");
        var cs = moviedata.states[loader.currentState];
        var cc = cs.changes[loader.currentChange];
        //create
        var nodeIndex = loader.registerNode(id);
        //base type
        if(loader.currentChange == 0){
            cs.nodeStates[nodeIndex] = {
                state: state,
                name: name,
                info: info
            };
            loader.currentNodeStates[nodeIndex] = state;
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
    addEdge: function(from, to, tag, state, name, info){
        //init
        if(loader.currentState == -1) loader.addState("None","");
        var cs = moviedata.states[loader.currentState];
        var cc = cs.changes[loader.currentChange];
        //create
        var edgeIndex = loader.registerEdge(from, to, tag);
        //base type
        if(loader.currentChange == 0){
            cs.edgeStates[edgeIndex] = {
                state: state,
                name: name,
                info: info
            };
            loader.currentEdgeStates[edgeIndex] = state;
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
            loader.currentNodeStates[nodeIndex] = STATE_NONE;
            for(var i = 0; i < moviedata.states.length; i++){
                moviedata.states[i].nodeStates[nodeIndex] = {state: STATE_NONE, name: '', info: ''};
            }
            //init size
            moviedata.nodeSize[nodeIndex] = calcSize("min");
            //stage
            moviedata.nodeViews[nodeIndex] = makeElement(id);
            mainGraph.addCell(moviedata.nodeViews[nodeIndex]);
        }

        return nodeIndex;
    },
    registerEdge: function(from, to, tag){
        var id = [from, to, tag].join(' ');
        //set up connected nodes
        if(moviedata.nodeIds.indexOf(from) == -1){        
            loader.addNode(from, STATE_UNKNOWN, from, '')
        }
        if(moviedata.nodeIds.indexOf(to) == -1){        
            loader.addNode(to, STATE_UNKNOWN, to, '')
        }
        //find edge
        var edgeIndex = moviedata.edgeIds.indexOf(id);
        if(edgeIndex == -1){
            //set up edge
            edgeIndex = moviedata.edgeIds.length;
            moviedata.edgeIds.push(id);
            //retroactive add
            loader.currentEdgeStates[edgeIndex] = STATE_NONE;
            for(var i = 0; i < moviedata.states.length; i++){
                moviedata.states[i].edgeStates[edgeIndex] = {state: STATE_NONE, name: '', info: ''};
            }
            //stage
            moviedata.edgeViews[edgeIndex] = makeLink(from, to);
            mainGraph.addCell(moviedata.edgeViews[edgeIndex]);
        }

        return edgeIndex;
    },
    layout: function(){
        var totalStates = moviedata.states.length;
        //reset all node sizes
        for(var i=0; i<moviedata.nodeSize.length;i++){
            moviedata.nodeViews[i].set('size', moviedata.nodeSize[i]);
        }
        //layout
        var size = joint.layout.DirectedGraph.layout(mainGraph, {
            setLinkVertices: false,
            nodeSep: 5,
            rankDir: "BT"
        });
        //cache the view elements
        for(var i=0; i<moviedata.nodeViews.length; i++){
            var model = moviedata.nodeViews[i];
            moviedata.nodeViews[i] = V(mainDisplay.findViewByModel(model).el);
        }
        for(i=0;i<moviedata.edgeViews.length;i++){
            var model = moviedata.edgeViews[i];
            moviedata.edgeViews[i] = V(mainDisplay.findViewByModel(model).el);
        }
        //set paper size with extra space for repositioning
        moviedata.height = size.height + window.innerHeight;
        moviedata.width = size.width + window.innerWidth;
        adjustPaper();
        //setup first states
        for(var i=0;i<moviedata.nodeViews.length;i++){
            moviedata.nodeViews[i].addClass(moviedata.states[0].nodeStates[i].state);
            //add names
            //moviedata.nodeViews[i].findOne("text").text(moviedata.states[0].nodeStates[i].name);
        }
        for(var i=0;i<moviedata.edgeViews.length;i++){
            moviedata.edgeViews[i].addClass(moviedata.states[0].edgeStates[i].state);
        }
        //setup '#list'
        for(var i=0; i<moviedata.states.length; i++){
            for(var j=0; j<moviedata.states[i].changes.length; j++){
                var state = moviedata.states[i].changes[j];
                state.$op.val(i+'c'+j).text(state.title);
            }
        }
        //select the first state
        moviedata.currentState = {b:0,c:0};
        $('#list').val('0c0');
        //allow user to use arrow keys without clicking
        $('#list').focus();
    }

}

/*****************/
/* file handling */
/*****************/
//handler for new file selection
function loadFile(file) {
    $('#list').empty();
    var reader = new FileReader();
    reader.onload = function(e) {
        //clear view
        resetData();
        //prep parser
        parser.useString(e.target.result)
        //parse data
        parser.parseLines();
        //currently data displayed automatically at completion of parse
    }
    if(file) reader.readAsText(file);
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

    // +1 within the same base state (for speed)
    if(oldBase == baseState && oldChange+1 == changeState && moviedata.mode != 'diff'){
        for(var cs=oldChange+1;cs<=changeState;cs++){
            var ncs = moviedata.states[baseState].changes[cs].nodeDiffs
            for(var n=0;n<ncs.length;n++){
                if(ncs[n].state != ncs[n].lastState){
                    moviedata.nodeViews[ncs[n].index].removeClass(ncs[n].lastState).addClass(ncs[n].state);
                }
                //moviedata.nodeViews[ncs[n].index].findOne("text").text(ncs[n].name);
            }
            var ecs = moviedata.states[baseState].changes[cs].edgeDiffs
            for(var e=0;e<ecs.length;e++){
                if(ecs[e].state != ecs[e].lastState){
                    moviedata.edgeViews[ecs[e].index].removeClass(ecs[e].lastState).addClass(ecs[e].state);
                }
            }
        }
    //arbitrary change of states
    }else{
        //change the state of all changed objects to their base state
        var cc = moviedata.states[oldBase].changes[oldChange];
        for(var i=0;i<cc.nodeDiffs.length;i++){
            var diff = cc.nodeDiffs[i]
            var ns = moviedata.states[oldBase].nodeStates[diff.index].state;
            if(moviedata.mode == 'diff') ns = STATE_NONE;
            if(ns != diff.state){
                moviedata.nodeViews[diff.index].removeClass(diff.state).addClass(ns);
            }
            //TODO: change name
        }
        for(var i=0;i<cc.edgeDiffs.length;i++){
            var diff = cc.edgeDiffs[i]
            var ns = moviedata.states[oldBase].edgeStates[diff.index].state;
            if(moviedata.mode == 'diff') ns = STATE_NONE;
            if(ns != diff.state){
                moviedata.edgeViews[diff.index].removeClass(diff.state).addClass(ns);
            }
        }
        //change all the objects to the new base state
        for(var i=0; i<moviedata.nodeIds.length; i++){
            var os = moviedata.states[oldBase].nodeStates[i].state;
            var ns = moviedata.states[baseState].nodeStates[i].state;
            if(moviedata.mode == 'diff') ns = STATE_NONE;
            if(ns != os){
                moviedata.nodeViews[i].removeClass(os).addClass(ns);
            }
            //TODO: change name
        }
        for(var i=0; i<moviedata.edgeIds.length; i++){
            var os = moviedata.states[oldBase].edgeStates[i].state;
            var ns = moviedata.states[baseState].edgeStates[i].state;
            if(moviedata.mode == 'diff') ns = STATE_NONE;
            if(ns != os){
                moviedata.edgeViews[i].removeClass(os).addClass(ns);
            }
        }
        //add the new changes
        var nc = moviedata.states[baseState].changes[changeState];
        for(i=0;i<nc.nodeDiffs.length;i++){
            var diff = nc.nodeDiffs[i]
            var os = moviedata.states[baseState].nodeStates[diff.index].state;
            if(os != diff.state){
                moviedata.nodeViews[diff.index].removeClass(os).addClass(diff.state);
            }
            //TODO: change name
        }
        for(i=0;i<nc.edgeDiffs.length;i++){
            var diff = nc.edgeDiffs[i]
            var os = moviedata.states[baseState].edgeStates[diff.index].state;
            if(os != diff.state){
                moviedata.edgeViews[diff.index].removeClass(os).addClass(diff.state);
            }
        }
    }
    //set current state
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
    //initial css load
    handleStyleChange();
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
    }
    $('#list').val(bs+"c"+cs);
    refreshGraph(bs,cs);
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
    $('#csschoice').prop('href','css/'+$('#style option:selected').val()+'.css');
    $('#list').focus();
}

/***********/
/* Helpers */
/***********/
function adjustPaper(){
    var h = moviedata.height;
    var w = moviedata.width;
    var z = moviedata.zoom;
    //move the paper out from under the controls
    V(mainDisplay.viewport).translate(-LEFT_CONTROL_BAR_WIDTH - 2, -TOP_CONTROL_BAR_HEIGHT - 2)
    V(mainDisplay.viewport).scale(z,z);
    V(mainDisplay.viewport).translate(LEFT_CONTROL_BAR_WIDTH + 2, TOP_CONTROL_BAR_HEIGHT + 2)
    mainDisplay.setDimensions(
        LEFT_CONTROL_BAR_WIDTH + w*z,
        TOP_CONTROL_BAR_HEIGHT+ h*z
    );
}

function resetData(){
    //clear main data object
    moviedata.firstUnLayedOutState = 0;
    moviedata.nodeIds = [];
    moviedata.nodeViews = [];
    moviedata.nodeSize = [];
    moviedata.edgeIds = [];
    moviedata.edgeViews = [];
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

