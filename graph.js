//major
//TODO: rewrite refresh
//TODO: write style.add()
//TODO: debug

//minor
//TODO: combine edge and node code where possible
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

//create views
var stage = $('<div id="stagingDisplay></div>')
var mainGraph = new joint.dia.Graph;
var stagingGraph = new joint.dia.Graph;
var mainDisplay = new joint.dia.Paper({
    el: $('#mainDisplay'),
    width: 200,
    height: 200,
    gridSize: 1,
    model: mainGraph
});
var stagingDisplay = new joint.dia.Paper({
    el: stage,
    width: 200,
    height: 200,
    gridSize: 1,
    model: stagingGraph
});

//move the paper out from under the controls
V(paper.viewport).translate(LEFT_CONTROL_BAR_WIDTH + 2, TOP_CONTROL_BAR_HEIGHT + 2)

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
        if(el.shift() == '['){
            args = el.split(' ');
            //extract the first element
            tag = args.shift();
        }else{
            //first line is without tag
            args = [];
            tag = '';
        }
        title = line.slice(split+1);
        //find next line
        var nextline = parser.currentLine+1;
        while(nextline<paser.lines.length && parser.lines[nextLine][0]!='[') {
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
        switch tag {
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
                break;
        }
    }
}

// Parses a file, storing all the data into the graphinfo object
// returns an array of graph elements
function parseSimpleAdaptonView(text){
    graphinfo.states = [];
    graphinfo.elements = [];
    graphinfo.links = [];
    console.log('spliting on state');
    states = text.split('Graph state: ');
    //first line is the blank before the first state
    states.shift();
    for(i=0;i<states.length;i++){
        console.log('starting parse of state '+i);
        graphinfo.states[i] = {
            title: "No name",
            elementStates: [],
            linkStates: [],
            cstates: []
        }
        var state = graphinfo.states[i]; //shortcut
        var changestates = states[i].split('Change state: ');
        //first entry is the main state
        var lines = changestates[0].split('\n');
        state.title = lines.shift();
        for(j=0;j<lines.length;j++){
            tokens = lines[j].split(' ');
            //process line as element
            if(tokens.length == 2){
                ename = tokens[0];
                estate = tokens[1];
                eindex = graphinfo.elements.indexOf(ename);
                if(eindex == -1){
                    graphinfo.elements.push(ename);
                    eindex = graphinfo.elements.length-1;
                }
                state.elementStates[eindex] = estate;
            }//end element parse
            //process line as link
            if(tokens.length == 3){
                //get line data
                fromNode = tokens[0];
                toNode = tokens[1];
                linkState = tokens[2];
                //set up the elements of the link if needed
                fromNodeIndex = graphinfo.elements.indexOf(fromNode);
                toNodeIndex = graphinfo.elements.indexOf(toNode);
                if(fromNodeIndex == -1){
                    graphinfo.elements.push(fromNode)
                    fromNodeIndex = graphinfo.elements.length-1;
                    state.elementStates[fromNodeIndex] = 'active';
                }
                if(toNodeIndex == -1){
                    graphinfo.elements.push(toNode)
                    toNodeIndex = graphinfo.elements.length-1;
                    state.elementStates[toNodeIndex] = 'active';
                }
                if(!state.elementStates[fromNodeIndex]) {
                    state.elementStates[fromNodeIndex] = 'active';
                }
                if(!state.elementStates[toNodeIndex]) {
                    state.elementStates[toNodeIndex] = 'active';
                }
                //set up the link
                linkIndex = graphinfo.links.indexOf(fromNode+' '+toNode);
                if(linkIndex == -1){
                    graphinfo.links.push(fromNode+' '+toNode);
                    linkIndex = graphinfo.links.length-1;
                }
                state.linkStates[linkIndex] = linkState;
            }//end link parse
        }//end main state line parse
        //parse the rest of the change states
        for(j=1;j<changestates.length;j++){
            graphinfo.states[i].cstates[j-1] = {
                title: "No name",
                elementStates: [],
                linkStates: [],
            }
            state = graphinfo.states[i].cstates[j-1]; //shortcut
            lines = changestates[j].split('\n');
            state.title = lines.shift();
            for(k=0;k<lines.length;k++){
                tokens = lines[k].split(' ');
                //process line as element
                if(tokens.length == 2){
                    ename = tokens[0];
                    estate = tokens[1];
                    eindex = graphinfo.elements.indexOf(ename);
                    if(eindex == -1){
                        graphinfo.elements.push(ename);
                        eindex = graphinfo.elements.length-1;
                    }
                    //TODO: get and save previous state for reverse-play
                    state.elementStates.push({i: eindex,s: estate});
                }//end element parse
                //process line as link
                if(tokens.length == 3){
                    //get line data
                    fromNode = tokens[0];
                    toNode = tokens[1];
                    linkState = tokens[2];
                    //set up the elements of the link if needed
                    fromNodeIndex = graphinfo.elements.indexOf(fromNode);
                    toNodeIndex = graphinfo.elements.indexOf(toNode);
                    //TODO: these missing nodes should probably be activated along with the link creation
                    if(fromNodeIndex == -1){
                        graphinfo.elements.push(fromNode)
                        fromNodeIndex = graphinfo.elements.length-1;
                    }
                    if(toNodeIndex == -1){
                        graphinfo.elements.push(toNode)
                        toNodeIndex = graphinfo.elements.length-1;
                    }
                    //set up the link
                    linkIndex = graphinfo.links.indexOf(fromNode+' '+toNode);
                    if(linkIndex == -1){
                        graphinfo.links.push(fromNode+' '+toNode);
                        linkIndex = graphinfo.links.length-1;
                    }
                    //TODO: get and save previous state for reverse-play
                    state.linkStates.push({i: linkIndex,s: linkState});
                }//end link parse
            }//end change line parse
        }//end change state parse
    }//end graph state parse
    //clean up data
    for(i=0;i<graphinfo.states.length;i++){
        var state = graphinfo.states[i]; //shortcut
        for(j=0;j<graphinfo.elements.length;j++){
            if(!state.elementStates[j]){
                state.elementStates[j] = 'nonactive';
            }
        }
        for(j=0;j<graphinfo.links.length;j++){
            if(!state.linkStates[j]){
                state.linkStates[j] = 'nonactive';
            }
        }
    }
    //create elements and links
    for(i=0;i<graphinfo.elements.length;i++){
        graphinfo.elements[i] = makeElement(graphinfo.elements[i]);
    }
    for(i=0;i<graphinfo.links.length;i++){
        var tofrom = graphinfo.links[i].split(' ');
        graphinfo.links[i] = makeLink(tofrom[0],tofrom[1]);
    }
    //return list of elements to graph
    return graphinfo.elements.concat(graphinfo.links);
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
            edgeDiffs: []
            $op = $('<option></option>')
        };
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
        $('#list').append($op.val(STATUS_LOADING).text('Loading ...'));
    },
    addChange: function(name, info){
        //init
        if(loader.currentState == -1) loader.addState("None","");
        var cs = movie.states[loader.currentState];
        var cc = cs.changes[loader.currentChange];
        //finalize previous
        cs.changes[loader.currentChange].$op.val(STATUS_WAITING).text('Awaiting Layout ...');
        for(var i = 0; i<cc.nodeDiffs.length; i++){
            currentNodeStates[cc.nodeDiffs[i].index] = cc.nodeDiffs[i].state;
        }
        for(var i = 0; i<cc.edgeDiffs.length; i++){
            currentEdgeStates[cc.edgeDiffs[i].index] = cc.edgeDiffs[i].state;
        }
        //new
        var newChange = {
            title: name,
            info: info,
            nodeStates: [],
            edgeStates: []
            $op = $('<option></option>')
        };
        //increment
        loader.currentChange = cs.changeStates.length;
        //store
        cs.changes.push(newChange);
        //view
        $('#list').append($op.val(STATUS_LOADING).text('Loading ...'));

    },
    finalize: function(){
        if(loader.currentState >= 0){
            moviedata.states[loader.currentState].changes[loader.currentChange].$op.text('Awaiting Layout ...');
        }
        _.delay(loader.layout(), 50);
    },
    addNode: function(id, state, name, info){
        //init
        if(loader.currentState == -1) loader.addState("None","");
        var cs = movie.states[loader.currentState];
        var cc = cs.changes[loader.currentChange];
        //create
        var nodeIndex = loader.registerNode(id);
        if(loader.currentChange == 0){
            //base type
            cs.nodeStates[nodeIndex] = {
                state: state,
                name: name,
                info: info
            };
            currentNodeStates[nodeIndex] = state;
        }else{
            //change type
            var newNode = {
                index: nodeIndex,
                state: state,
                lastState: currentNodeStates[nodeIndex],
                name: name,
                info: info
            }
            cc.nodeDiffs.push(newNode);
        }
        //update size
        os = moviedata.nodeSize[nodeIndex];
        ns = calcSize(name);
        moviedata.nodeSize[nodeIndex] = {width: max(os.width, ns.width), height: max(os.height, ns.height)};
    },
    addEdge: function(from, to, tag, state, name, info){
        //init
        if(loader.currentState == -1) loader.addState("None","");
        var cs = movie.states[loader.currentState];
        var cc = cs.changes[loader.currentChange];
        //create
        var edgeIndex = loader.registerEdge(from, to, tag);
        if(loader.currentChange == 0){
            //base type
            cs.edgeStates[edgeIndex] = {
                state: state,
                name: name,
                info: info
            };
            currentEdgeStates[edgeIndex] = state;
        }else{
            //change type
            var newEdge = {
                index: edgeIndex,
                state: state,
                lastState: currentEdgeStates[edgeIndex],
                name: name,
                info: info
            }
            cc.edgeDiffs.push(newEdge);
        }
    },
    registerNode: function(id){
        //find node
        var nodeIndex = moviedata.nodeIds.indexOf(id);
        if(nodeIndex == -1){
            //setup node
            nodeIndex = moviedata.nodeIds.length;
            moviedata.nodes.push(id);
            //retroactive add
            loader.currentNodeStates[nodeIndex] = STATE_NONE;
            for(var i = 0; i < movie.states.length){
                movie.states[i].nodeStates[nodeIndex] = {state: STATE_NONE, name: '', info: ''};
            }
        }
        //stage
        moviedata.nodeViews[nodeIndex] = makeElement(id);
        mainGraph.addCell(moviedata.nodeViews[nodeIndex]);

        return nodeIndex;
    },
    registerEdge: function(from, to, tag){
        var id = [to, from, tag].join(' ');
        //set up connected nodes
        if(moviedata.nodes.indexOf(from) == -1){        
            loader.addNode(from, STATE_UNKNOWN, from, '')
        }
        if(moviedata.nodes.indexOf(to) == -1){        
            loader.addNode(to, STATE_UNKNOWN, to, '')
        }
        //find edge
        var edgeIndex = moviedata.edgeIds.indexOf(id);
        if(edgeIndex == -1){
            //set up edge
            edgeIndex = moviedata.edgeIds.length;
            moviedata.edges.push(id);
            //retroactive add
            loader.currentEdgeStates[edgeIndex] = STATE_NONE;
            for(var i = 0; i < movie.states.length){
                movie.states[i].edgeStates[edgeIndex] = {state: STATE_NONE, name: '', info: ''};
            }
        }
        //stage
        moviedata.edgeViews[edgeIndex] = makeLink(to, from);
        mainGraph.addCell(moviedata.edgeViews[edgeIndex]);

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
            moviedata.links[i] = V(mainDisplay.findViewByModel(model).el);
        }
        //set paper size with extra space for repositioning
        moviedata.height = size.height + window.height;
        moviedata.width = size.width + window.width;
        adjustPaper();
        //setup first states
        for(var i=0;i<moviedata.nodeViews.length;i++){
            moviedata.nodeViews[i].addClass(moviedata.states[0].nodeStates[i]);
        }
        for(var i=0;i<moviedata.edgeViews.length;i++){
            moviedata.edgeViews[i].addClass(moviedata.states[0].edgeStates[i]);
        }
        //setup '#list'
        for(var i=0; i<moviedata.states.length){
            for(var j=0; j<moviedata.states[i].changes.length){
                var state = moviedata.states[i].changes[j];
                state.$op.val(i+'c'+j).text(state.title);
            }
        }
        //select the first state
        moviedata.currentState = {b:0,c:0};
        $('#list').val('0c0');
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
        mainGraph.resetCells();
        //prep parser
        parser.useString(e.target.result)
        //parse data
        parser.parseLines();
        //currently data displayed automatically at completion of parse
    }
    reader.readAsText(file);
}

function oldLoadFile(file) {
    $('#list').empty();
    var reader = new FileReader();
    reader.onload = function (e) {
        console.log('file loaded');
        filecontents = e.target.result;
        //parse data into graphinfo and cells
        console.log('starting parse');
        cells = parseSimpleAdaptonView(filecontents);
        console.log('parse complete');
        //lay out the graph
        console.log('starting graph generation');
        graph.resetCells(cells);
        console.log('generation complete');
        console.log('starting layout');
        var size = joint.layout.DirectedGraph.layout(graph, {
            setLinkVertices: false,
            nodeSep: 5,
            rankDir: "BT"
        });
        //set paper size
        var extra_space = 100;//give some extra space for repositioning
        graphinfo.height = size.height + extra_space;
        graphinfo.width = size.width + extra_space;
        adjustPaper();
        console.log('layout complete')
        //re-map elements to editable view elements for efficiency
        console.log('elements: '+graphinfo.elements.length);
        for(i=0;i<graphinfo.elements.length;i++){
            model = graphinfo.elements[i];
            graphinfo.elements[i] = V(paper.findViewByModel(model).el);
        }
        console.log('links: '+graphinfo.links.length);
        for(i=0;i<graphinfo.links.length;i++){
            model = graphinfo.links[i];
            graphinfo.links[i] = V(paper.findViewByModel(model).el);
        }
        //set first states
        console.log('loading first states');
        graphinfo.currentFullState = {
            elementStates: [],
            linkStates: []
        }
        for(i=0;i<graphinfo.elements.length;i++){
            graphinfo.elements[i].addClass(graphinfo.states[0].elementStates[i]);
            graphinfo.currentFullState.elementStates[i] = graphinfo.states[0].elementStates[i];
        }
        for(i=0;i<graphinfo.links.length;i++){
            graphinfo.links[i].addClass(graphinfo.states[0].linkStates[i]);
            graphinfo.currentFullState.linkStates[i] = graphinfo.states[0].linkStates[i];
        }
        //populate list box with states
        for(i=0;i<graphinfo.states.length;i++){
            $('#list').append('<option value="'+i+'c-1">'+graphinfo.states[i].title+'</option>');
            if(graphinfo.states[i].cstates && graphinfo.states[i].cstates.length){
                for(c=0;c<graphinfo.states[i].cstates.length;c++){
                    $('#list').append('<option value="'+i+'c'+c+'">-'+graphinfo.states[i].cstates[c].title+'</option>');
                }
            }
        }
        //select the first state
        graphinfo.currentBState = 0;
        graphinfo.currentCState = -1;
        $('#list').val('0c-1');
        console.log('ready for user interation');
    }//end file load handler
    console.log('loading file');
    reader.readAsText(file);
}
/***********/
/* Visuals */
/***********/
function refreshGraph(baseState, changeState){
    if(baseState == -1 || baseState == NaN) return;
    //shortcuts
    var eso = graphinfo.currentFullState.elementStates;
    var lso = graphinfo.currentFullState.linkStates;
    var esn = graphinfo.states[baseState].elementStates;
    var lsn = graphinfo.states[baseState].linkStates;

    //forward within the same base state
    if(graphinfo.currentBState == baseState && graphinfo.currentCState < changeState){
        //only load the changes
        for(cs=graphinfo.currentCState+1;cs<=changeState;cs++){
            var ecs = graphinfo.states[baseState].cstates[cs].elementStates;
            var lcs = graphinfo.states[baseState].cstates[cs].linkStates;
            for(c=0;c<ecs.length;c++){
                graphinfo.elements[ecs[c].i].removeClass(eso[ecs[c].i]).addClass(ecs[c].s);
                eso[ecs[c].i] = ecs[c].s;                
            }
            for(c=0;c<lcs.length;c++){
                graphinfo.links[lcs[c].i].removeClass(lso[lcs[c].i]).addClass(lcs[c].s);
                lso[lcs[c].i] = lcs[c].s;
            }
        }
    //arbitrary change of states
    }else{
        //change the state of all the stored objects to the base state
        for(i=0;i<graphinfo.elements.length;i++){
            var ns = esn[i];
            if(graphinfo.mode == 'diff') {
                 ns = 'nonactive'; 
            }
            if(ns != eso[i]){
                graphinfo.elements[i].removeClass(eso[i]).addClass(ns);
                eso[i] = ns;
            }
        }
        for(i=0;i<graphinfo.links.length;i++){
            var ns = lsn[i];
            if(graphinfo.mode == 'diff') {
                 ns = 'nonactive'; 
            }
            if(ns != lso[i]){
                graphinfo.links[i].removeClass(lso[i]).addClass(ns);
                lso[i]=ns;
            }
        }
        //add all the changes
        for(cs=0;cs<=changeState;cs++){
            var ecs = graphinfo.states[baseState].cstates[cs].elementStates;
            var lcs = graphinfo.states[baseState].cstates[cs].linkStates;
            for(c=0;c<ecs.length;c++){
                graphinfo.elements[ecs[c].i].removeClass(eso[ecs[c].i]).addClass(ecs[c].s);
                eso[ecs[c].i] = ecs[c].s;
            }
            for(c=0;c<lcs.length;c++){
                graphinfo.links[lcs[c].i].removeClass(lso[lcs[c].i]).addClass(lcs[c].s);
                lso[lcs[c].i] = lcs[c].s;
            }
        }    
    }
    //set current state
    graphinfo.currentBState = baseState;
    graphinfo.currentCState = changeState;
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
    var ss = $('#list option:selected').val().split('c');
    var bs = parseInt(ss[0]);
    var cs = parseInt(ss[1]);

    moviedata.mode = event.target.value;
    //force redraw
    moviedata.currentState.b = -1;
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

function makeLink(parentElementLabel, childElementLabel) {

    return new joint.dia.Link({
        source: { id: parentElementLabel },
        target: { id: childElementLabel },
        attrs: { '.marker-target': { d: 'M 4 0 L 0 2 L 4 4 z' } },
        smooth: true
    });
}
function calcSize(label) {
    var lines = label.split('\n');
    var maxLineLength = _.max(lines, function(l) { return l.length; }).length;
    // Compute width/height of the rectangle based on the number
    // of lines in the label and the letter size. 0.6 * letterSize is
    // an approximation of the monospace font letter width.
    var width = 2 * (NODE_TEXT_SIZE * (0.6 * maxLineLength + 1));
    var height = 2 * ((lines.length + 1) * letterSize);
    return {width: width, height: height};

}

function makeElement(label) {
    var s = calcSize(label);
    return new joint.shapes.basic.Rect({
        id: label,
        size: { width: s.w, height: s.h },
        attrs: {
            text: {
                text: label,
                'font-size': NODE_TEXT_SIZE,
                'font-family': 'monospace',
                'transform': ''
            },
            rect: {
                width: s.w, height: s.h,
                rx: 5, ry: 5,
                stroke: '#555'
            }
        }
    });
}

