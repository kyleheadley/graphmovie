//init
var graph = new joint.dia.Graph;
var paper = new joint.dia.Paper({
    el: $('#paper'),
    width: 2000,
    height: 2000,
    gridSize: 1,
    model: graph
});
//Just give the viewport a little padding.
V(paper.viewport).translate(20, 20);
//holds all the layed out data
graphs = [];
//store all the text of all the open files
var filecontents = []

/***********/
/* Parsing */
/***********/

function buildGraphFromAdjacencyList(adjacencyList) {

    var elements = [];
    var links = [];
    
    _.each(adjacencyList, function(edges, parentElementLabel) {
        elements.push(makeElement(parentElementLabel));

        _.each(edges, function(childElementLabel) {
            links.push(makeLink(parentElementLabel, childElementLabel));
        });
    });

    // Links must be added after all the elements. This is because when the links
    // are added to the graph, link source/target
    // elements must be in the graph already.
    return elements.concat(links);
}

function makeLink(parentElementLabel, childElementLabel) {

    return new joint.dia.Link({
        source: { id: parentElementLabel },
        target: { id: childElementLabel },
        attrs: { '.marker-target': { d: 'M 4 0 L 0 2 L 4 4 z' } },
        smooth: true
    });
}

function makeElement(label) {

    var maxLineLength = _.max(label.split('\n'), function(l) { return l.length; }).length;

    // Compute width/height of the rectangle based on the number
    // of lines in the label and the letter size. 0.6 * letterSize is
    // an approximation of the monospace font letter width.
    var letterSize = 8;
    var width = 2 * (letterSize * (0.6 * maxLineLength + 1));
    var height = 2 * ((label.split('\n').length + 1) * letterSize);

    return new joint.shapes.basic.Rect({
        id: label,
        size: { width: width, height: height },
        attrs: {
            text: { text: label, 'font-size': letterSize, 'font-family': 'monospace' },
            rect: {
                width: width, height: height,
                rx: 5, ry: 5,
                stroke: '#555'
            }
        }
    });
}

function parseDot(text){
    //assuming specialized .dot format
    var lines = text.split('\n');
    var nodes = [];
    var links = [];
    for(var i = 5;i<lines.length-2;i++){
        tokens = lines[i].split(' ');
        console.log(tokens);
        if(tokens[3] == '->'){
            links.push(makeLink(tokens[2],tokens[4]));
        } else {
           nodes.push(makeElement(tokens[2]))
        }
    }

    return nodes.concat(links);
}

/*****************/
/* file handling */
/*****************/
//utility for parsing all the files
var grapher = {active: false, ready: [], finished:[], graph:function(index){
    //don't do unneccesary work
    if(grapher.active) return;
    if(!grapher.ready[index]) return;
    if(grapher.finished[index]) return;
    //do neccesary work
    grapher.active = true;
    var cells;
    try {
        var adjacencyList = eval(filecontents[index]);
        cells = buildGraphFromAdjacencyList(adjacencyList);
        console.log("Parsed simple adjacency list");
    } catch (e) {
        cells = parseDot(filecontents[index]);
        console.log("Parsed dot file");
    }
    graphs[index] = cells;
    graph.resetCells(cells);
    console.log("laying out graph: "+index);
    joint.layout.DirectedGraph.layout(graph, { setLinkVertices: false });
    console.log("done");
    grapher.finished[index] = true;
    //TODO: change color of list box item
    //find next ready item
    for(var i = 0;i< grapher.ready.length;i++){
        if(grapher.ready[i] && !grapher.finished[i]){
            //pause for a bit to allow user interaction
            _.delay(grapher.graph, 50, i);
            break;
        }
    }
    grapher.active = false;
}}
//handler for new file selection
function handleFileSelect(event) {
    var files = event.target.files;
    var count = files.length;
    var readers = new Array(count);
    //reset data
    grapher.active = false;
    grapher.ready = new Array(count);
    grapher.finished = new Array(count);
    graphs = new Array(count);
    filecontents = new Array(count);
    $('#filelist').empty();
    //open all the files at once
    for(var i = 0; i< files.length;i++){
        //include the name and index in our list
        $('#filelist').append('<option value="'+i+'">'+files[i].name+'</option>');
        //save the text in a global array
        readers[i] = new FileReader();
        //closure to store index value
        readers[i].onload =  (function(index){return function (e) {
            filecontents[index] = e.target.result;
            grapher.ready[index] = true;
            grapher.graph(index);
        }})(i);
        readers[i].readAsText(files[i]);
    }
}
//set the change handler
$('#files').change(handleFileSelect);

/********************/
/* listbox handling */
/********************/
function handleListSelect(event){
    var index = parseInt(event.target.value);
    grapher.graph(index);
//version 0.9.0
//    graph.resetCells(graphs[index].getElements());
//    graph.addCells(graphs[index].getLinks());
    graph.resetCells(graphs[index]);
}
//set the change handler
$('#filelist').change(handleListSelect);
