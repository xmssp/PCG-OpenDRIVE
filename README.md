#Procedure visualizing OpenDIRVE sample data sets in Three.js

##Run
```
$ npm install http-server
$ cd dir/to/this/project
$ http-server .
```
Then open the browser. 

The project provides a basic user interface to show/hide road reference lines, static/dynamic signals, and provide 5 data sets in total for visualization.

##Notes

The road network is procedurally generated in Three.js. It only exploits the mesh and basic material without specifying uvs for texturing.

The coordinate system used in this project is a right-handed Cartesian coordinate system, with x-y plane representing the ground surface, z points to up towards the sky. The initial view is the top view over the origin, with positive z pointing towards the screen. For geographic reference, x points to the east; y points to the north; z points to up.

For more details about the cooridnate systems and other elements used in this project, please refert to the [OpenDRIVE V1.4 Format Specification](http://www.opendrive.org/docs/OpenDRIVEFormatSpecRev1.4H.pdf).

##Known Issues

All visible components in the scene is a mesh, including the grey road surface, elevated curbs, and road marks.

Mesh are not optimized for there are duplicate faces and vertices.

It is not recommended to use the exported .obj file as a real mesh to import to Unity or Unreal engine. Further cleaning jobs on the mesh are needed.