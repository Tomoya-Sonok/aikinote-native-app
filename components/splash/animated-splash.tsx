import { useEffect } from "react";
import { Image, StyleSheet, Text } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

const LOGO = require("@/assets/images/aikinote-logo.png");

const TAGLINE_JA = "合気道に特化したデジタル稽古日誌＆SNSアプリ";
const TAGLINE_EN = "A digital training journal & SNS for Aikido";

// Web 版チュートリアル StepWelcome の fadeInUp（duration 0.7s）より少し長め
const LOGO_DELAY_MS = 200;
const TAGLINE_DELAY_MS = 700;
const ITEM_DURATION_MS = 900;
const TRANSLATE_OFFSET = 14;

const LOADER_FADE_DURATION_MS = 250;

export const SPLASH_FADE_OUT_DURATION_MS = 320;

type Props = {
  visible: boolean;
  showLoader: boolean;
  onAnimationComplete: () => void;
};

export function AnimatedSplash({
  visible,
  showLoader,
  onAnimationComplete,
}: Props) {
  const overlayOpacity = useSharedValue(1);
  const logoOpacity = useSharedValue(0);
  const logoTranslateY = useSharedValue(TRANSLATE_OFFSET);
  const taglineOpacity = useSharedValue(0);
  const taglineTranslateY = useSharedValue(TRANSLATE_OFFSET);

  useEffect(() => {
    const easing = Easing.out(Easing.ease);

    logoOpacity.value = withDelay(
      LOGO_DELAY_MS,
      withTiming(1, { duration: ITEM_DURATION_MS, easing }),
    );
    logoTranslateY.value = withDelay(
      LOGO_DELAY_MS,
      withTiming(0, { duration: ITEM_DURATION_MS, easing }),
    );

    taglineOpacity.value = withDelay(
      TAGLINE_DELAY_MS,
      withTiming(1, { duration: ITEM_DURATION_MS, easing }, (finished) => {
        if (finished) {
          runOnJS(onAnimationComplete)();
        }
      }),
    );
    taglineTranslateY.value = withDelay(
      TAGLINE_DELAY_MS,
      withTiming(0, { duration: ITEM_DURATION_MS, easing }),
    );
  }, [
    logoOpacity,
    logoTranslateY,
    taglineOpacity,
    taglineTranslateY,
    onAnimationComplete,
  ]);

  useEffect(() => {
    if (!visible) {
      overlayOpacity.value = withTiming(0, {
        duration: SPLASH_FADE_OUT_DURATION_MS,
        easing: Easing.out(Easing.ease),
      });
    }
  }, [visible, overlayOpacity]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [{ translateY: logoTranslateY.value }],
  }));

  const taglineStyle = useAnimatedStyle(() => ({
    opacity: taglineOpacity.value,
    transform: [{ translateY: taglineTranslateY.value }],
  }));

  return (
    <Animated.View style={[styles.overlay, overlayStyle]} pointerEvents="none">
      <Animated.View style={logoStyle}>
        <Image source={LOGO} style={styles.logo} resizeMode="contain" />
      </Animated.View>
      <Animated.View style={[styles.taglineWrapper, taglineStyle]}>
        <Text style={styles.taglineJa}>{TAGLINE_JA}</Text>
        <Text style={styles.taglineEn}>{TAGLINE_EN}</Text>
      </Animated.View>
      <Loader visible={showLoader} />
    </Animated.View>
  );
}

type LoaderProps = {
  visible: boolean;
};

function Loader({ visible }: LoaderProps) {
  const opacity = useSharedValue(0);
  const rotation = useSharedValue(0);
  const spinnerOpacity = useSharedValue(0.7);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, {
        duration: 2000,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      false,
    );
    spinnerOpacity.value = withRepeat(
      withTiming(1, {
        duration: 1000,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      true,
    );
  }, [rotation, spinnerOpacity]);

  useEffect(() => {
    opacity.value = withTiming(visible ? 1 : 0, {
      duration: LOADER_FADE_DURATION_MS,
      easing: Easing.out(Easing.ease),
    });
  }, [visible, opacity]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  const spinnerStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
    opacity: spinnerOpacity.value,
  }));

  return (
    <Animated.View style={[styles.loaderContainer, containerStyle]}>
      <Animated.View style={[styles.spinner, spinnerStyle]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#ffffff",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  logo: {
    width: 80,
    height: 80,
    marginBottom: 28,
  },
  taglineWrapper: {
    alignItems: "center",
    maxWidth: 320,
  },
  taglineJa: {
    fontSize: 16,
    color: "#2c2c2c",
    letterSpacing: 1.5,
    lineHeight: 26,
    fontWeight: "500",
    textAlign: "center",
  },
  taglineEn: {
    marginTop: 8,
    fontSize: 12,
    color: "#838383",
    letterSpacing: 0.5,
    lineHeight: 18,
    fontWeight: "400",
    textAlign: "center",
  },
  loaderContainer: {
    position: "absolute",
    bottom: 80,
    alignItems: "center",
    justifyContent: "center",
  },
  spinner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: "#e8e4df",
    borderTopColor: "#838383",
  },
});
