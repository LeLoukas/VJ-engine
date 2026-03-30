import { Node } from './Node.js';

/**
 * RouteInNode
 * Se connecte automatiquement au RouteOutNode du même nom.
 * La connexion virtuelle est établie par NodeGraph._linkRoutes().
 */
export class RouteInNode extends Node {
  constructor() {
    super();
    this.label     = 'In';
    this.routeName = 'route1';
  }
  get inputPorts()  { return ['input']; }  // connecté virtuellement à RouteOut
  get outputPorts() { return ['output']; }

  render() {
    // La texture arrive via le port 'input' connecté par NodeGraph
    return this.getInputTexture('input');
  }
}
