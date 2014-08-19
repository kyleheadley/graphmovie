// Helpers.
// --------

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

function handleFileSelect(event) {
    var files = event.target.files;
    var f = files[0];
    var reader = new FileReader();
    reader.onload = function (e) {
        $('#adjacency-list').val(e.target.result);
        layout();
    }
    reader.readAsText(f);
}

$('#files').change(handleFileSelect);

// Main.
// -----

var graph = new joint.dia.Graph;

var paper = new joint.dia.Paper({

    el: $('#paper'),
    width: 2000,
    height: 2000,
    gridSize: 1,
    model: graph
});

// Just give the viewport a little padding.
V(paper.viewport).translate(20, 20);

$('#btn-layout').on('click', layout);

function layout() {

    var cells;
    
    try {
        var adjacencyList = eval('adjacencyList = ' + $('#adjacency-list').val());
        cells = buildGraphFromAdjacencyList(adjacencyList);
        console.log("Parsed simple adjacency list");
    } catch (e) {
        cells = parseDot($('#adjacency-list').val());
        console.log("Parsed dot file");
    }
    
    graph.resetCells(cells);
    joint.layout.DirectedGraph.layout(graph, { setLinkVertices: false });
}
layout();

