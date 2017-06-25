(function() {
	"use strict";
	
	var wsUrl = "ws://45.55.209.67:4571/rtsearches", // URL of web socket providing search data
		svg = d3.select("svg"), // SVG element
		width = +svg.attr("width"), // width of SVG
		height = +svg.attr("height"), // height of SVG
		padding = { // padding for SVG
			left : 45,
			right : 30,
			top : 30,
			bottom : 30,
			middle : 50, // between graph and search results
			betweenItems : 10, // between items in search results
			belowGraph: 80 // between graph and legend (to accomodate x axis tick labels)
		},
		searchWidth = 500, // width of search term display
		lengthHeight = 150, // height of legend for browsers
		animationDuration = 200, // duration for animaitons
		graphWidth = width - padding.left - padding.middle - padding.right - searchWidth, // width of graph
		graphHeight = height - padding.top - padding.bottom - lengthHeight, // height of graph
		graphG, // SVG g element that holds the graph
		searchG, // SVG g element that holds search results
		noTicksInGraph = 15, // number of time periods shown in graph
  		xScale = d3.scaleLinear().domain([0, noTicksInGraph - 1]).range([0, graphWidth]), // map array index to x position on graph
		yScale = d3.scaleLinear().domain([0, 1]).range([graphHeight, 0]), // map [0, 1] to graph height
		// map browser to color
		colorScale = d3.scaleOrdinal().domain(["android", "blackberry", "chrome", "edge", "firefox", "ie", "opera", "safari", "none"]).range(["#14736b", "#21634a", "#024a7a", "#316786", "#403186", "#8c004d", "#7d0b70", "#66284d", "#444"]),
		browsers = { // mapping from browser names returned by web socket to data keys
			"Android Webview" : "android",
			"BlackBerry" : "blackberry",
			"Chrome" : "chrome",
			"Edge" : "edge",
			"Firefox" : "firefox",
			"Internet Explorer" : "ie",
			"Opera" : "opera",
			"Safari" : "safari"
		},
		graphData, // data for graph
		areaGenerator, // generator for graph
		stack, // processed grphData to input for areaGenerator
		noSearchItems = 6, // number of search items shown
		maxSearchChars = 38, // max number of characters to show in search item (rest will be truncated)
		searchId = 0, // id of search item
		searchData = d3.range(noSearchItems).map(function() { // add noSearchItems blank search items to display
			return { id : searchId++, browser: "none", text: ""};	
		}),
		searchItemHeight = (height - padding.top - padding.bottom) / searchData.length - padding.betweenItems, // height of search item
		timeData; // data with time instances when search results arrived
		
	function setupConnection() {
		var connection = new WebSocket(wsUrl); // connect to web socket
	
		// Log errors
		connection.onerror = function (error) {
			console.log('WebSocket Error ' + error);
		};
		
		// Update graph and search display when new search terms arrive
		connection.onmessage = function (e) {
			var temp;

			timeData.push(new Date()); // store time instance when search terms arrived
			timeData.shift(); // remove first stored time instance
			temp = { // create new search data to store
				android: graphData[graphData.length  -1].android, 
				blackberry: graphData[graphData.length  -1].blackberry, 
				chrome: graphData[graphData.length  -1].chrome,
				edge: graphData[graphData.length  -1].edge, 
				firefox: graphData[graphData.length  -1].firefox,
				ie: graphData[graphData.length  -1].ie,
				opera: graphData[graphData.length  -1].opera,
				safari: graphData[graphData.length  -1].safari
				
			};
			temp[browsers[JSON.parse(e.data)[0].browser]]++; // increase browser count for browser of search terms
			graphData.push(temp); // add new search terms (new data point) to graph data
			updateGraph(graphData); // update graph display
	      	graphData.shift(); // remove frist data point from graph data
	      	
	      	searchData.push({ // add received search terms to search data
	      		id: searchId++,
	      		browser : browsers[JSON.parse(e.data)[0].browser],
	      		text: JSON.parse(e.data)[0].terms
	      	});
	      	searchData.shift(); // remove first search terms from search data
	      	updateSearch(searchData); // update search display
  		};
	}

	/** 
  	 * Add button to element deifned by selector.
	 * Clicking in the button will add mock search term for random browser.
  	 */
  	function addDebugButton(selector) {
  		
	 	// Returns a random integer between d[0] and d[1] (inclusive).
		function getRandomInt(d) {
  			return Math.floor(Math.random() * (d[1]- d[0] + 1)) + d[0];
		}

  		d3.select(selector)
  			.append("button")
  			.text("Add mock search")
			.on("click", function() {
  				var selectedBrowser = Object.values(browsers)[getRandomInt([0, Object.values(browsers).length])],
  					temp = {
						android: graphData[graphData.length  -1].android, 
						blackberry: graphData[graphData.length  -1].blackberry, 
						chrome: graphData[graphData.length  -1].chrome,
						edge: graphData[graphData.length  -1].edge, 
						firefox: graphData[graphData.length  -1].firefox,
						ie: graphData[graphData.length  -1].ie,
						opera: graphData[graphData.length  -1].opera,
						safari: graphData[graphData.length  -1].safari
					};
				temp[selectedBrowser]++;
				graphData.push(temp);
				updateGraph(graphData);
		      	graphData.shift();

		  		searchData.push({
		      		id: searchId++,
		      		browser : selectedBrowser,
		      		text: "[Mock search term]"
		      	});
		      	searchData.shift();
		      	updateSearch(searchData);
		  		});
  	}	

	/**
	 * Update grpah with new data.
	 * This should be called after each new data point is added to data, and when this returns first data
	 * point shold be removed.
	 * To slide the grpah to left, this function first adds new data point to the left of graph (hidden by clipping area).
	 * Next all data points slide from right to left.
	 * As result first data point moved to the right of grpah (hidden by clipping path).
	 */
	function updateGraph(data) {
		var path,
			tick;

		// update paths - just enter and exit, we will animate the entire path below
		path = graphG.select("g.paths").selectAll("path")
			.data(stack(data), function(d, i) {
				return d.id;
			});
		path.enter()
			.append('path')
			.style('fill', function(d, i) {
				return colorScale(colorScale.domain()[i]);
			})
			.attr('d', areaGenerator);
		path.exit()
			.remove();
		
		// animate paths sliding right to left by one data point
	    graphG.select("g.paths").selectAll("path")
	    	.attr("d", areaGenerator)
       		.attr("transform", null)
      		.transition()
   			.duration(animationDuration)
  			.ease(d3.easeLinear)
      			.attr("transform", "translate(" + xScale(-1) + ",0)");
      	
      	// update time stamps in bottom axis ticks
      	tick = graphG.select(".axis.bottom").selectAll("text")
      		.data(timeData);
      	tick.text(function(d) { 
      		return d3.timeFormat("%H:%M:%S.%L")(d); 
      	});

	}

	/** 
	 * Update search display.
	 * Remove first item (at top), sliede other items up, add new (last) item to bottom.
	 */
	function updateSearch(data) {
		var rect, // rectangle for search item
			text; // text of search item

		// join search data to rectangles
		rect = searchG.select(".rects").selectAll('rect')
			.data(data, function(d) {
				return d.id;
			});
		// add rectangle to bottom (wait for other rectangles to move up, then animate in from the left)
		rect.enter()
			.append("rect")
			.attr("x", 0)
			.attr("width", 0)
    		.attr("height", searchItemHeight)
    		.style('fill', function(d, i) {
				return colorScale(d.browser);
			})
			.attr("y", function(d, i) {
				return i * (searchItemHeight + padding.betweenItems);
			})
			.transition()
			.delay(animationDuration)
			.duration(animationDuration)
			.ease(d3.easeElastic)
				.attr("width", searchWidth - 20);
		// move old rectangles up
		rect
			.transition()
			.duration(animationDuration)
			.ease(d3.easeExp)
				.attr("y", function(d, i) {
					return i * (searchItemHeight + padding.betweenItems);
				});
		// move top most rectangle up (same as all other rectangles) and out of search display, then remove
		rect.exit()
			.transition()
			.duration(animationDuration)
				.ease(d3.easeExp)
				.attr("y", -searchItemHeight - padding.betweenItems)						
				.remove();


		// join search data to text elements
    	text = searchG.select(".texts").selectAll('text')
			.data(data, function(d) {
				return d.id;
			});

		// add text to bottom rectangle (wait for other rectangles to move up, then animate in from the left)
		// trim text and add elipsis if search text has more than maxSearchChars characters
		text.enter()
			.append("text")
			.attr("x", -searchWidth)
			.attr("y", function(d, i) {
				return i * (searchItemHeight + padding.betweenItems) + searchItemHeight / 2;
			})
			.text(function(d) {
				return d.text.length > maxSearchChars ? (d.text.slice(0, maxSearchChars) + "...") : d.text;
			})
			.transition()
			.delay(animationDuration)
			.duration(animationDuration)
			.ease(d3.easeElastic)
				.attr("x", 10);
		// move old text elements up
		text
			.transition()
			.duration(animationDuration)
			.ease(d3.easeExp)
				.attr("y", function(d, i) {
					return i * (searchItemHeight + padding.betweenItems) + searchItemHeight / 2;
				});
		// move top most text element up (same as all other text elements) and out of search display, then remove
		text.exit()
			.transition()
			.duration(animationDuration)
			.ease(d3.easeExp)
				.attr("y", function () {
					return -searchItemHeight - padding.betweenItems;
				})
				.remove();		
	}

	/** 
	 * Append legend below graph.
	 * Legend will occupy remaning space after grpah and search display are positioned.
	 * Legend has two rows and four columns.
	 */
	function appendLegend() {
		var legendG = svg.select(".legend"),
			xOffset = graphWidth / 4, // split available horizontal space into four parts
			yOffset = (height - padding.top - graphHeight - padding.belowGraph -padding.bottom) / 2, // split available vertical space in two parts
			g;

		g = legendG.append("g")
			.attr("transform", "translate(" + (0 * xOffset) + ", 0)");
		g.append("rect")
			.attr("width", 20)
			.attr("height", 20)
			.style("fill", colorScale("safari"));
		g.append("text")
			.attr("x", 25)
			.attr("y", 11)
			.text("Safari");
		g = legendG.append("g")
			.attr("transform", "translate(" + (1 * xOffset) + ", 0)");
		g.append("rect")
			.attr("width", 20)
			.attr("height", 20)
			.style("fill", colorScale("ie"));
		g.append("text")
			.attr("x", 25)
			.attr("y", 11)
			.text("Internet Explorer");
		g = legendG.append("g")
			.attr("transform", "translate(" + (2 * xOffset) + ", 0)");
		g.append("rect")
			.attr("width", 20)
			.attr("height", 20)
			.style("fill", colorScale("edge"));
		g.append("text")
			.attr("x", 25)
			.attr("y", 11)
			.text("Edge");
		g = legendG.append("g")
			.attr("transform", "translate(" + (3 * xOffset) + ", 0)");
		g.append("rect")
			.attr("width", 20)
			.attr("height", 20)
			.style("fill", colorScale("blackberry"));
		g.append("text")
			.attr("x", 25)
			.attr("y", 11)
			.text("BlackBerry");


		g = legendG.append("g")
			.attr("transform", "translate(" + (0 * xOffset) + ", " + yOffset + ")");
		g.append("rect")
			.attr("width", 20)
			.attr("height", 20)
			.style("fill", colorScale("opera"));
		g.append("text")
			.attr("x", 25)
			.attr("y", 11)
			.text("Opera");
		g = legendG.append("g")
			.attr("transform", "translate(" + (1 * xOffset) + ", " + yOffset + ")");
		g.append("rect")
			.attr("width", 20)
			.attr("height", 20)
			.style("fill", colorScale("firefox"));
		g.append("text")
			.attr("x", 25)
			.attr("y", 11)
			.text("Firefox");
		g = legendG.append("g")
			.attr("transform", "translate(" + (2 * xOffset) + ", " + yOffset + ")");
		g.append("rect")
			.attr("width", 20)
			.attr("height", 20)
			.style("fill", colorScale("chrome"));
		g.append("text")
			.attr("x", 25)
			.attr("y", 11)
			.text("Chrome");
		g = legendG.append("g")
			.attr("transform", "translate(" + (3 * xOffset) + ", " + yOffset + ")");
		g.append("rect")
			.attr("width", 20)
			.attr("height", 20)
			.style("fill", colorScale("android"));
		g.append("text")
			.attr("x", 25)
			.attr("y", 11)
			.text("Android Webview");
	}

	/**
	 * Create graph, search display, and legend.
	 */
	function create() {
		// initially asingn 1 to each browser
		graphData = d3.range(noTicksInGraph + 1).map(function() {
			return {android: 1, blackberry: 1, chrome: 1, edge: 1, firefox: 1, ie: 1, opera: 1, safari: 1};
		});
		// fill all timestamps with current data (to initialise x axis on graph)
		timeData = d3.range(noTicksInGraph).map(function() {
			return new Date();
		});
		// generator of areas in the graph
		areaGenerator = d3.area()
			.x(function(d, i) {
				return xScale(i);
			})
			.y0(function(d) {
				return yScale(d[0]);
			})
			.y1(function(d) {
				return yScale(d[1]);
			});
		// parse data for graph
		stack = d3.stack()
  			.keys(["android", "blackberry", "chrome", "edge", "firefox", "ie", "opera", "safari"])
  			.offset(d3.stackOffsetExpand);

  		// append G for graph
		graphG = svg.append("g")
			.classed("graph", true)
			.attr("transform", "translate(" + padding.left + ", " + padding.top + ")");
		// append clipping path to hide areas outside of graph (neede to animate new data sliding in from the right)
		graphG.append("defs")
			.append("clipPath")
    			.attr("id", "clip")
  					.append("rect")
    				.attr("width", graphWidth)
    				.attr("height", graphHeight);

		// append G to graph that will hold paths (browser bands) shown in graph    	
    	graphG.append("g")
    		.classed("paths", true)
    		.attr("clip-path", "url(#clip)");
    	// add left y axis
    	graphG.append("g")
    		.classed("axis left", true)
    		.call(d3.axisLeft(yScale));
    	// add right y axis
    	graphG.append("g")
    		.classed("axis right", true)
    		.attr("transform", "translate(" + graphWidth + ", 0)")
    		.call(d3.axisRight(yScale));
    	// add bottom x axis
    	graphG.append("g")
    		.classed("axis bottom", true)
    		.attr("transform", "translate(0, " + graphHeight + ")")
    		.call(d3.axisBottom(xScale));
    	// rotate tick label on bottom x axis
    	graphG.select(".axis.bottom").selectAll("text")
    		.attr("transform", "translate(-29, 27) rotate(-55)");
    	// display initial data on graph
    	updateGraph(graphData);
    	// initial data has one extra data point, since updateGraph slides graph from right to reveal last data point
    	// remove first data point, which is no longer visible as it slid out on the left
    	graphData.shift();

    	// append G for search display
    	searchG = svg.append("g")
    		.classed("search", true)
    		.attr("transform", "translate(" + (graphWidth + padding.left + padding.middle) + ", " + padding.top + ")");
    	// append clipping path for search display
    	searchG.append("defs")
			.append("clipPath")
    			.attr("id", "clipSearch")
  					.append("rect")
    				.attr("width", searchWidth)
    				.attr("height", height);
		searchG.attr("clip-path", "url(#clipSearch)");
		// append G for rectangles of search items
    	searchG.append("g")
    		.classed("rects", true);
    	// append G for text of search items
    	searchG.append("g")
    		.classed("texts", true);
    	// display initial blank search items
    	updateSearch(searchData);

    	// add legend below graph
    	svg.append("g")
    		.classed("legend", true)
    		.attr("transform", "translate(" + padding.left + ", " + (padding.top + graphHeight + padding.belowGraph) +")");
    	appendLegend();
	}


	// create graph, search display, and legend
	create();
	// connect to web socket
	setupConnection();
  	// add debug button (click adds mock search term)
  	addDebugButton("#debugButton");
})();
