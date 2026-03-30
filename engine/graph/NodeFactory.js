import { ShaderSourceNode } from '../nodes/sources/ShaderSourceNode.js';
import { GameOfLifeNode }   from '../nodes/sources/GameOfLifeNode.js';
import { WebcamNode }       from '../nodes/sources/WebcamNode.js';
import { MediaNode }        from '../nodes/sources/MediaNode.js';
import { TextNode }         from '../nodes/sources/TextNode.js';
import { DrawNode }         from '../nodes/sources/DrawNode.js';
import { MidiNode }         from '../nodes/sources/MidiNode.js';
import { ConstantNode }     from '../nodes/sources/ConstantNode.js';
import { LFONode }          from '../nodes/sources/LFONode.js';
import { AudioNode }        from '../nodes/sources/AudioNode.js';
import { FractalNode }      from '../nodes/sources/FractalNode.js';
import { MatrixNode }       from '../nodes/sources/MatrixNode.js';
import { ShaderEditNode }   from '../nodes/sources/ShaderEditNode.js';
import { VideoCollageNode } from '../nodes/sources/VideoCollageNode.js';
import { GlitchNode }       from '../nodes/effects/GlitchNode.js';
import { FeedbackNode }     from '../nodes/effects/FeedbackNode.js';
import { BlurNode }         from '../nodes/effects/BlurNode.js';
import { MixNode }          from '../nodes/effects/MixNode.js';
import { KaleidoscopeNode } from '../nodes/effects/KaleidoscopeNode.js';
import { ChromaKeyNode }    from '../nodes/effects/ChromaKeyNode.js';
import { DistortionNode }   from '../nodes/effects/DistortionNode.js';
import { RGBSplitNode }     from '../nodes/effects/RGBSplitNode.js';
import { PixelateNode }     from '../nodes/effects/PixelateNode.js';
import { PosterizeNode }    from '../nodes/effects/PosterizeNode.js';
import { NoiseNode }        from '../nodes/effects/NoiseNode.js';
import { ColorGradeNode }   from '../nodes/effects/ColorGradeNode.js';
import { StrobeNode }       from '../nodes/effects/StrobeNode.js';
import { TransformNode }    from '../nodes/effects/TransformNode.js';
import { PixelFallNode }    from '../nodes/effects/PixelFallNode.js';
import { SharpenNode }      from '../nodes/effects/SharpenNode.js';
import { BloomNode }        from '../nodes/effects/BloomNode.js';
import { VortexNode }       from '../nodes/effects/VortexNode.js';
import { VideoDelayNode }   from '../nodes/effects/VideoDelayNode.js';
import { SceneMixNode }     from '../nodes/effects/SceneMixNode.js';
import { RerouteNode }      from '../nodes/RerouteNode.js';
import { RouteInNode }      from '../nodes/RouteInNode.js';
import { RouteOutNode }     from '../nodes/RouteOutNode.js';
import { OutputNode }       from '../nodes/OutputNode.js';

const REGISTRY = {
  ShaderSourceNode, GameOfLifeNode, WebcamNode, MediaNode,
  TextNode, DrawNode, MidiNode, ConstantNode, LFONode, AudioNode,
  FractalNode, MatrixNode, ShaderEditNode, VideoCollageNode,
  GlitchNode, FeedbackNode, BlurNode, MixNode,
  KaleidoscopeNode, ChromaKeyNode, DistortionNode, RGBSplitNode,
  PixelateNode, PosterizeNode, NoiseNode, ColorGradeNode, StrobeNode,
  TransformNode, PixelFallNode, SharpenNode, BloomNode, VortexNode,
  VideoDelayNode, SceneMixNode,
  RerouteNode, RouteInNode, RouteOutNode, OutputNode,
};

export class NodeFactory {
  static create(type) {
    const Ctor = REGISTRY[type];
    if (!Ctor) throw new Error(`NodeFactory: unknown type "${type}"`);
    return new Ctor();
  }
  static types() { return Object.keys(REGISTRY); }
  create(type)   { return NodeFactory.create(type); }
}
