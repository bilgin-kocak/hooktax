// The whole film: every scene on the absolute clock, the chapter tag, captions and the voiceover.
import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import { Background, Caption, ChapterTag } from "./components";
import { Chain, Cold, Measured, Title, Worst } from "./scenesA";
import { Arkiv, Close, Cre, Real } from "./scenesB";
import { C } from "./theme";
import { FPS, T, ramp, useSeconds } from "./time";

export const HookTax: React.FC = () => {
  const t = useSeconds();
  return (
    <AbsoluteFill style={{ background: C.bg }}>
      <Background />
      <Cold t={t} />
      <Title t={t} />
      <Chain t={t} />
      <Measured t={t} />
      <Worst t={t} />
      <Real t={t} />
      <Arkiv t={t} />
      <Cre t={t} />
      <Close t={t} />
      <ChapterTag t={t} />
      <Caption t={t} hidden={["title", "close"]} />
      <AbsoluteFill style={{ background: "#000", opacity: ramp(t, T.duration - 0.7, T.duration) }} />
      {Object.entries(T.vo).map(([name, vo]) => (
        <Sequence key={name} from={Math.round(vo.start * FPS)} durationInFrames={Math.ceil((vo.duration + 0.2) * FPS)} layout="none">
          <Audio src={staticFile(vo.file)} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
