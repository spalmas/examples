// Displays global population density and population totals by country in
// chart or table form.


/*
 * DATA SOURCES
 */

// Country boundary data with associated precomputed population totals.
// These are USDOS LSIB boundaries simplified somewhat for visualization.
var SSA = ee.FeatureCollection('users/palmasforest/acidsoils_bycountry_app2');

// Country boundary data to clip
var SSA_polygons = ee.FeatureCollection("USDOS/LSIB_SIMPLE/2017")
  .filter(ee.Filter.eq('wld_rgn', 'Africa'))
  .filter(ee.Filter.neq('country_co', 'CV'))  //CaboVerde
  .filter(ee.Filter.neq('country_co', 'MO'))  //Morroco
  .filter(ee.Filter.neq('country_co', 'SP'))  //Spain
  .filter(ee.Filter.neq('country_co', 'PO'))  //Portugal
  .filter(ee.Filter.neq('country_co', 'AG'))  //Algeria
  .filter(ee.Filter.neq('country_co', 'TS'))  //Tunisia
  .filter(ee.Filter.neq('country_co', 'LY'))  //Lybia
  .filter(ee.Filter.neq('country_co', 'WI'))  //Western Sahara
  .filter(ee.Filter.neq('country_co', 'EG')); //Egypt

//Background images
var zero = ee.Image(0);
var SSAwater = ee.Image("MODIS/006/MOD44W/2015_01_01").select('water_mask').clip(SSA_polygons);
//var SSApop = ee.Image("users/palmasforest/AFR_PPP_2020_adj_v2").clip(SSA_polygons).rename(SSApop);

//Multiband layer and its properties
var multiband = ee.Image('users/palmasforest/acidsoil_multiband_forapp2');
//Dictionary with the label, name and vis parameters for the multiband
var layerProperties = {
   'pH of Crop Areas': {
    name: 'crop_ph',
    visParams: {min: 0, max: 75, palette: ['black', 'FF6B00', 'gray']},
    legend: [{'Acid Cropland': 'FF6B00'}, {'Cropland': 'D4EB8D'}],
    defaultVisibility: true
  },
  'Population': {
    name: 'SSApop',
    visParams: {min: 0, max: 5000, palette: ['black', '00A7CE'], opacity:0.5},
    legend: [{'5000': '00A7CE'}, {'0': 'black'}],
    defaultVisibility: false
  },
};

// Dictionary of locations for explorer
var locationDict = {
  'Africa overview': {lon: 20, lat: -7, zoom: 3},
  'Maize in western Kenya': {lon: 35, lat: -0, zoom: 8},
  'Rwanda, Uganda, Congo': {lon: 30, lat: -1, zoom: 7},
  'Congo mouth': {lon: 13, lat: -4, zoom: 7}
};

/*
 * ++++++++ MAP PANEL CONFIGURATION ++++++++
 */
// Create a map panel.
var mapPanel = ui.Map();

//Default location of map (Continental view)
var defaultLocation = locationDict['Africa overview'];
mapPanel.setCenter(defaultLocation.lon, defaultLocation.lat, defaultLocation.zoom);

// Add these to the interface.
ui.root.widgets().reset([mapPanel]);
ui.root.setLayout(ui.Panel.Layout.flow('horizontal'));

// Take all tools off the map except the zoom and mapTypeControl tools.
mapPanel.setControlVisibility({all: false, zoomControl: true, mapTypeControl: true});
mapPanel.style().set({cursor: 'crosshair'});

// Constants used to visualize the data on the map.
var FONT_STYLE = {color: '55565A', fontFamily: 'Serif', backgroundColor:'d9d9d9'};
var COUNTRIES_STYLE = {color: 'white', fillColor: '00000000'};
var HIGHLIGHT_STYLE = {color: 'white', fillColor: '8856a7C0'}; 

// Add all layers of multiband to the map
for (var key in layerProperties) {
  var layer = layerProperties[key];
  var image = multiband.select(layer.name).visualize(layer.visParams);
  var masked = addZeroAndWaterMask(image, multiband.select(layer.name));
  mapPanel.add(ui.Map.Layer(masked, {}, key, layer.defaultVisibility));
}

//mapPanel.add(SSA.style(COUNTRIES_STYLE));


// Draws black and gray overlays for noncrop/water/ values.
function addZeroAndWaterMask(visualized, original) {
  // Places where there is nodata or water are drawn in gray.
  var zero = ee.Image(0).visualize({palette: '55565A'});
  // Continent background with black for landmass and blue for water
  var water = SSAwater.visualize({min:0, max:1, palette: ['black', '00A7CE']});
  // Population layer
  //var pop = SSApop.visualize({min:0, max:15634.134765625, palette:['black', 'white']});
  // Stack the images, with the gray on top, black next, and the original below.
  return ee.ImageCollection([zero, water, visualized]).mosaic();
}


/*
 * CHART PANEL IN THE BOTTOM-RIGHT
 */

// A list of points the user has clicked on, as [lon,lat] tuples.
var selectedPoints = [];

// Returns the list of countries the user has selected.
function getSelectedCountries() {
  return SSA.filterBounds(ee.Geometry.MultiPoint(selectedPoints));
}

// Updates the map overlay using the currently-selected countries.
function updateOverlay() {
  var overlay = getSelectedCountries().style(HIGHLIGHT_STYLE);
  mapPanel.layers().set(2, ui.Map.Layer(overlay));
}

// Makes a bar chart of the given FeatureCollection of countries by name.
function makeResultsBarChart(SSA) {
  var chart = ui.Chart.feature.byFeature({
    features:SSA,
    xProperty:'country_na',
    yProperties:['croparea_k', 'acidcropar']
  });
  chart.setChartType('BarChart');
  chart.setOptions({
    title: 'Crop area (km2)',
    vAxis: {title: null},
    hAxis: {title: 'km2', minValue: 0}
  });
  chart.style().set({stretch: 'both'});
  return chart;
}

// Makes a table of the given FeatureCollection of countries by name.
function makeResultsTable(SSA) {
  var table = ui.Chart.feature.byFeature({
    features:SSA,
    xProperty:'country_na',
    yProperties:['croparea_k']
  });
  table.setChartType('Table');
  table.setOptions({allowHtml: true, pageSize: 5});
  table.style().set({stretch: 'both'});
  return table;
}

// Updates the chart using the currently-selected charting function,
function updateChart() {
  var chartBuilder = chartTypeToggleButton.value;
  var chart = chartBuilder(getSelectedCountries());
  resultsPanel.clear().add(chart).add(buttonPanel);
}

// Clears the set of selected points and resets the overlay and panel to their default state.
function clearResults() {
  selectedPoints = [];
  mapPanel.layers().remove(mapPanel.layers().get(2));
  var instructionsLabel = ui.Label('Select regions to compare population.');
  resultsPanel.widgets().reset([instructionsLabel]);
}

// Register a click handler for the map that adds the clicked point to the
// list and updates the map overlay and chart accordingly.
function handleMapClick(location) {
  selectedPoints.push([location.lon, location.lat]);
  updateOverlay();
  updateChart();
}
mapPanel.onClick(handleMapClick);

// A button widget that toggles (or cycles) between states.
// To construct a ToggleButton, supply an array of objects describing
// the desired states, each with 'label' and 'value' properties.
function ToggleButton(states, onClick) {
  var index = 0;
  var button = ui.Button(states[index].label);
  button.value = states[index].value;
  button.onClick(function() {
    index = ++index % states.length;
    button.setLabel(states[index].label);
    button.value = states[index].value;
    onClick();
  });
  return button;
}

// Our chart type toggle button: the button text is the opposite of the
// current state, since you click the button to switch states.
var chartTypeToggleButton = ToggleButton(
    [{label: 'Display results as table',value: makeResultsBarChart,},
      {label: 'Display results as chart',value: makeResultsTable,}],
    updateChart);

// A panel containing the two buttons .
var buttonPanel = ui.Panel(
    [ui.Button('Clear results', clearResults), chartTypeToggleButton],
    ui.Panel.Layout.Flow('horizontal'), {margin: '0 0 0 auto', width: '500px'});

var resultsPanel = ui.Panel({style: {position: 'bottom-right'}});
mapPanel.add(resultsPanel);
clearResults();


/*
 * +++++++++++++ PANEL ON THE RIGHT +++++++++++++ 
 */
// Add a title and some explanatory text tso a side panel.
var header = ui.Label('Acid soils in Africa',
  {fontFamily: 'Serif', fontSize: '36px', color: '55565A', backgroundColor:'d9d9d9'});
//var header = ui.Label({value:'Acid soils in Africa', style:FONT_STYLE});

var text = ui.Label('Explorer of acidity conditions of soils in crop areas in sub-Saharan Africa.',
  {fontFamily: 'Serif', fontSize: '15px', backgroundColor:'d9d9d9'});

var toolPanel = ui.Panel({
  widgets:[header, text],
  layout:'flow', 
  style:{width: '350px', color:'55565A', backgroundColor:'d9d9d9'}
});
ui.root.widgets().add(toolPanel);

/*
 * Pulldown menu for changing layer and legend
 */

// The elements of the pulldown are the keys of the layerProperties dictionary.
var selectItems = Object.keys(layerProperties);

var layerSelect = ui.Select({
  items: selectItems,     // items to pick
  value: selectItems[0],   // Starting value
  onChange: function(selected) {
    // Loop through the map layers and compare the selected element to the name
    // of the layer. If they're the same, show the layer and set the
    // corresponding legend.  Hide the others.
    mapPanel.layers().forEach(function(element, index) {
      element.setShown(selected == element.getName());
    });
    setLegend(layerProperties[selected].legend);
  }
});

// Add the select to the toolPanel with some explanatory text.
toolPanel.add(ui.Label('View Different Layers', {fontFamily: 'Serif', fontSize: '24px', backgroundColor:'d9d9d9'}));
toolPanel.add(layerSelect);

// Define a panel for the legend and give it a title.
var legendPanel = ui.Panel({
  style:{fontWeight: 'bold', fontSize: '10px', margin: '0 0 0 8px', padding: '0', backgroundColor:'d9d9d9'}
});
toolPanel.add(legendPanel);

var legendTitle = ui.Label(
    'Legend',{fontWeight: 'bold', fontSize: '10px', margin: '0 0 4px 0', padding: '0', backgroundColor:'d9d9d9'});
legendPanel.add(legendTitle);

// Define an area for the legend key itself.
// This area will be replaced every time the layer pulldown is changed.
var keyPanel = ui.Panel();
legendPanel.add(keyPanel);

function setLegend(legend) {
  // Loop through all the items in a layer's key property,
  // creates the item, and adds it to the key panel.
  keyPanel.clear();
  for (var i = 0; i < legend.length; i++) {
    var item = legend[i];
    var name = Object.keys(item)[0];
    var color = item[name];
    var colorBox = ui.Label('', {
      
      backgroundColor: color,
      // Use padding to give the box height and width.
      padding: '8px',
      margin: '0'
    });
    // Create the label with the description text.
    var description = ui.Label(name, {margin: '0 0 4px 6px', backgroundColor:'d9d9d9'});
    keyPanel.add(
        ui.Panel([colorBox, description], ui.Panel.Layout.Flow('horizontal'), {backgroundColor:'d9d9d9'}));
  }
}

// Set the initial legend.
setLegend(layerProperties[layerSelect.getValue()].legend);


/*
 * Checkboxes for other layers
 */
var checkbox = ui.Checkbox({
  label:'Show population layer', value: false, style: {fontSize: '10px', backgroundColor:'d9d9d9'}
});
checkbox.onChange(function(checked) {
  // Shows or hides the first map layer based on the checkbox's value.
  mapPanel.layers().get(1).setShown(checked);
});
//Adding tool to panel
toolPanel.add(checkbox); 


/*
 * Location explorer
 */
var locations = Object.keys(locationDict);  //Just the keys of the dictoinary of locations
var locationPanel = ui.Panel({widgets:[
  // Label
  ui.Label('Visit Example Locations', {fontFamily: 'Serif', fontSize: '24px', backgroundColor:'d9d9d9'}), 
  // Select menu
  ui.Select({
  items: locations,
  value: locations[0],
  onChange: function(value) {
    var location = locationDict[value];
    mapPanel.setCenter(location.lon, location.lat, location.zoom);
  }})],
  style:{backgroundColor:'d9d9d9'}
  
});

//Adding tool to panel
toolPanel.add(locationPanel); 
// Create a layer selector pulldown.
// The elements of the pulldown are the keys of the layerProperties dictionary.
var selectItems = Object.keys(layerProperties);

/*
 * Information links in the bottom
 */

var link = ui.Label(
    'CIMMYT, BMGF.', {backgroundColor:'d9d9d9'},
    'http://www.cimmyt.org');
var linkPanel = ui.Panel({
    widgets:[ui.Label('For more information',
      {color: '55565A', fontFamily: 'Serif', backgroundColor:'d9d9d9'}),
      link],
    style:{backgroundColor:'d9d9d9'}
});
toolPanel.add(linkPanel);