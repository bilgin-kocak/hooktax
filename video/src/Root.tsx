import React from "react";
import { Composition } from "remotion";
import { HookTax } from "./HookTax";
import { FPS, T } from "./time";

export const Root: React.FC = () => (
  <Composition id="HookTax" component={HookTax} durationInFrames={Math.ceil(T.duration * FPS)} fps={FPS} width={1920} height={1080} defaultProps={{ stills: false }} />
);
