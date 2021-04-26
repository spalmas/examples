

// Import country boundaries feature collection.
var dataset = ee.FeatureCollection('USDOS/LSIB_SIMPLE/2017');

// Apply filter where country name equals Nigeria.
var nigeriaBorder = dataset.filter(ee.Filter.eq('country_na', 'Nigeria'));

// Print new "nigeriaBorder" object and explorer features and properties.
// There should only be one feature representing Nigeria.
print(nigeriaBorder);

// Add Nigeria outline to the Map as a layer.
Map.centerObject(nigeriaBorder, 6);

//Setting color parameters for Nigeria Boundary
var shown = true; // true or false, 1 or 0 
var opacity = 0.2; // number [0-1]
var nameLayer = 'map'; // string
var visParams = {color: 'red'}; // dictionary: 
Map.addLayer(nigeriaBorder, visParams, nameLayer, shown, opacity);


//Setting color parameters for Maize target area boundary
var shown = true; // true or false, 1 or 0 
var opacity = 0.5; // number [0-1]
var nameLayer = 'map2'; // string
var visParams = {color: 'brown', strokeWidth: 5}; // dictionary:
Map.addLayer(aoi, visParams, nameLayer, shown, opacity);

//Display training and test points to visualize distribution within the aoi
Map.addLayer(trainpts, {color:'FF0000'});
Map.addLayer(testpts, {color:'00FFFF'});

//Ingest sentinel 2A imageries
var s2 = ee.ImageCollection("COPERNICUS/S2");

// Bits 10 and 11 are clouds and cirrus, respectively.
var cloudBitMask = ee.Number(2).pow(10).int();
var cirrusBitMask = ee.Number(2).pow(11).int();

//set function to generate cloud mask
function maskS2clouds(image) {
  var qa = image.select('QA60');
  // Both flags should be set to zero, indicating clear conditions.
  var mask = qa.bitwiseAnd(cloudBitMask).eq(0).and(
             qa.bitwiseAnd(cirrusBitMask).eq(0));
  return image.updateMask(mask);
}

//Apply the cloud mask with other filters to derive a mosaic within spatial and temporal context
var cloudMasked = s2.filterBounds(aoi).map(maskS2clouds).filterDate('2017-06-15', '2017-10-15');
var min = cloudMasked.min();
var mosaic = ee.ImageCollection(min).mosaic();

//Create Custom mosaic from selected bands to visualize minimized cloud
Map.addLayer(mosaic, {bands: ['B4', 'B3', 'B2'], max: 2000}, 'custom mosaic');

//Starting Classification process  
var bands = ['B1','B2','B3','B4','B5','B6', 'B7', 'B8', 'B8A', 'B9', 'B10','B11', 'B12'];

var image_cl = mosaic
  .select(bands);
  
// Overlay the points on the imagery to get training.
var training = image_cl.sampleRegions({
  collection: trainpts,
  properties: ['class'],
  scale: 30
});

// Train a CART classifier with default parameters.
var trained = ee.Classifier.smileCart().train(training, 'class', bands);

//Train a RF classifier with default parameters.
var trained_rf = ee.Classifier.smileRandomForest(10)
    .train({
      features: training,
      classProperty: 'class',
      inputProperties: bands
    });

// Classify the image with the same bands used for training.
var classified = image_cl.select(bands).classify(trained);
var classified_rf = image_cl.select(bands).classify(trained_rf);

// Create a palette to display the classes.
var palette =['00008B', '32CD32'];

Map.addLayer(classified,{min: 0, max: 1, palette: palette},'class');
Map.addLayer(classified_rf,{min: 0, max: 1, palette: palette},'class');

// Get a confusion matrix representing resubstitution accuracy.
var trainAccuracy = trained.confusionMatrix();
print('Resubstitution error matrix: ', trainAccuracy);
print('Training overall accuracy: ', trainAccuracy.accuracy());
  
var trainAccuracy_rf = trained_rf.confusionMatrix();
print('Resubstitution error matrix: ', trainAccuracy_rf);
print('Training overall accuracy: ', trainAccuracy_rf.accuracy());
  

 // Use the testpts to extract pixel values from the bands for validation
 
  var testing = image_cl.sampleRegions({
  collection: testpts,
  properties: ['class'],
  scale: 30
}).filter(ee.Filter.neq('B1', null)); //filter added to rid out null pixels

// Classify the validation data
var validated = testing.classify(trained);
var validated_rf = testing.classify(trained_rf);

// Get a confusion matrix representing expected accuracy.
//For CART
var testAccuracy = validated.errorMatrix('class', 'classification');
print('Validation error matrix: ', testAccuracy);
print('Validation overall accuracy: ', testAccuracy.accuracy());

//For RF
var testAccuracy_rf = validated_rf.errorMatrix('class', 'classification');
print('Validation error matrix: ', testAccuracy_rf);
print('Validation overall accuracy: ', testAccuracy_rf.accuracy());


Map.addLayer(aoi); 

//Exporting to RF classified imagery to google bucket drive; If you use any other type of staorage solution, set the command as appropriate
  Export.image.toDrive({
 image: classified_rf,
  description: 'Maizeland_Classified',
  scale: 20,
  region: aoi,
  maxPixels: 100000000000,
});


//To calculate Maize Area
var areaImage = ee.Image.pixelArea().addBands(
      classified_rf);
      
var areas = areaImage.reduceRegion({
      reducer: ee.Reducer.sum().group({
      groupField: 1,
      groupName: 'class',
    }),
    geometry: aoi.geometry(),
    scale: 500,
    maxPixels: 1e10
    }); 
 print (areas);

//Maize area calculated is 190846878246 sq meters.


