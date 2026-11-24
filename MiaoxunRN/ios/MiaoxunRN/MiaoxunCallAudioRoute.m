#import <AVFoundation/AVFoundation.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <UIKit/UIKit.h>
#import <TargetConditionals.h>
#import <WebRTC/RTCAudioSession.h>

static NSString *const MiaoxunCallAudioRouteChanged = @"MiaoxunCallAudioRouteChanged";

// This adapter changes route preferences only. WebRTC retains ownership of the
// audio category, mode, activation count and audio unit throughout the call.
@interface MiaoxunCallAudioRoute : RCTEventEmitter <RCTBridgeModule, RTCAudioSessionDelegate>
@end

@implementation MiaoxunCallAudioRoute {
  dispatch_queue_t _routeQueue;
  BOOL _hasListeners;
  BOOL _ownsPreference;
  BOOL _invalidated;
  NSMutableDictionary<NSString *, AVAudioSessionPortDescription *> *_wiredOutputs;
}

RCT_EXPORT_MODULE(MiaoxunCallAudioRoute)

+ (BOOL)requiresMainQueueSetup { return NO; }

- (instancetype)init {
  if ((self = [super init])) {
    _routeQueue = dispatch_queue_create("com.miaoxun.call-audio-route", DISPATCH_QUEUE_SERIAL);
    _wiredOutputs = [NSMutableDictionary new];
    [[RTCAudioSession sharedInstance] addDelegate:self];
  }
  return self;
}

- (dispatch_queue_t)methodQueue { return _routeQueue; }
- (NSArray<NSString *> *)supportedEvents { return @[MiaoxunCallAudioRouteChanged]; }

- (void)startObserving {
  _hasListeners = YES;
  [self publishSnapshot];
}

- (void)stopObserving { _hasListeners = NO; }

- (NSString *)kindForPort:(AVAudioSessionPortDescription *)port {
  NSString *type = port.portType;
  if ([type isEqualToString:AVAudioSessionPortBuiltInReceiver]) return @"earpiece";
  if ([type isEqualToString:AVAudioSessionPortBuiltInSpeaker]) return @"speaker";
  if ([type isEqualToString:AVAudioSessionPortBluetoothHFP] ||
      [type isEqualToString:AVAudioSessionPortBluetoothA2DP] ||
      [type isEqualToString:AVAudioSessionPortBluetoothLE]) return @"bluetooth";
  if ([type isEqualToString:AVAudioSessionPortHeadphones] ||
      [type isEqualToString:AVAudioSessionPortHeadsetMic] ||
      [type isEqualToString:AVAudioSessionPortUSBAudio] ||
      [type isEqualToString:AVAudioSessionPortLineOut] ||
      [type isEqualToString:AVAudioSessionPortLineIn]) return @"wired";
  return @"other";
}

- (NSString *)inputId:(AVAudioSessionPortDescription *)port {
  return [@"input:" stringByAppendingString:port.UID];
}

- (NSString *)outputId:(AVAudioSessionPortDescription *)port {
  return [@"output:" stringByAppendingString:port.UID];
}

- (AVAudioSessionPortDescription *)inputForOutput:(AVAudioSessionPortDescription *)output
                                         inputs:(NSArray<AVAudioSessionPortDescription *> *)inputs {
  NSString *kind = [self kindForPort:output];
  NSMutableArray<AVAudioSessionPortDescription *> *named = [NSMutableArray new];
  NSMutableArray<AVAudioSessionPortDescription *> *compatible = [NSMutableArray new];
  for (AVAudioSessionPortDescription *input in inputs) {
    if ([input.portType isEqualToString:AVAudioSessionPortBuiltInMic]) continue;
    if ([input.UID isEqualToString:output.UID]) return input;
    if (![[self kindForPort:input] isEqualToString:kind]) continue;
    if ([input.portName isEqualToString:output.portName]) [named addObject:input];
    BOOL sameType = [input.portType isEqualToString:output.portType];
    BOOL headsetPair = [output.portType isEqualToString:AVAudioSessionPortHeadphones] &&
        [input.portType isEqualToString:AVAudioSessionPortHeadsetMic];
    if (sameType || headsetPair) [compatible addObject:input];
  }
  if (named.count == 1) return named.firstObject;
  // Never infer that unrelated wired types (for example USB and headphones)
  // describe the same device merely because there is one available input.
  return compatible.count == 1 ? compatible.firstObject : nil;
}

- (NSDictionary *)device:(NSString *)identifier kind:(NSString *)kind name:(NSString *)name {
  NSMutableDictionary *device = [@{@"id": identifier, @"kind": kind} mutableCopy];
  if (name.length) device[@"name"] = name;
  return device;
}

// Must run under the RTCAudioSession configuration lock. AVAudioSession has no
// availableOutputs API; retain only previously observed output-only wired ports
// until a disconnect/reset notification, so speaker override can be undone.
- (NSDictionary *)snapshotLocked:(RTCAudioSession *)rtc {
  NSArray<AVAudioSessionPortDescription *> *inputs = rtc.session.availableInputs ?: @[];
  NSArray<AVAudioSessionPortDescription *> *outputs = rtc.currentRoute.outputs;
  NSMutableDictionary<NSString *, NSDictionary *> *devices = [NSMutableDictionary new];
  AVAudioSessionPortDescription *builtIn = nil;
  __unused BOOL hasWired = NO;
  for (AVAudioSessionPortDescription *input in inputs) {
    if ([input.portType isEqualToString:AVAudioSessionPortBuiltInMic]) {
      builtIn = input;
      continue;
    }
    NSString *kind = [self kindForPort:input];
    if ([kind isEqualToString:@"wired"]) hasWired = YES;
    NSString *identifier = [self inputId:input];
    devices[identifier] = [self device:identifier kind:kind name:input.portName];
  }
  NSString *currentId = nil;
  for (AVAudioSessionPortDescription *output in outputs) {
    NSString *kind = [self kindForPort:output];
    AVAudioSessionPortDescription *input = [self inputForOutput:output inputs:inputs];
    NSString *identifier;
    if ([kind isEqualToString:@"speaker"] || [kind isEqualToString:@"earpiece"]) {
      identifier = kind;
    } else {
      identifier = input ? [self inputId:input] : [self outputId:output];
      if ([kind isEqualToString:@"wired"] && !input) _wiredOutputs[identifier] = output;
    }
    devices[identifier] = [self device:identifier kind:kind name:output.portName];
    if (outputs.count == 1) currentId = identifier;
  }
  for (NSString *identifier in _wiredOutputs) {
    AVAudioSessionPortDescription *output = _wiredOutputs[identifier];
    // A matching input is more useful because it can be explicitly selected.
    if ([self inputForOutput:output inputs:inputs]) continue;
    devices[identifier] = [self device:identifier kind:@"wired" name:output.portName];
    hasWired = YES;
  }
  if (builtIn) {
    devices[@"speaker"] = [self device:@"speaker" kind:@"speaker" name:nil];
    // The simulator has no physical receiver even when its UI idiom is Phone.
    // A wired output also takes precedence over the receiver on real devices.
#if !TARGET_OS_SIMULATOR
    if (!hasWired && UIDevice.currentDevice.userInterfaceIdiom == UIUserInterfaceIdiomPhone &&
        !(rtc.categoryOptions & AVAudioSessionCategoryOptionDefaultToSpeaker)) {
      devices[@"earpiece"] = [self device:@"earpiece" kind:@"earpiece" name:nil];
    }
#endif
  }
  NSArray *keys = [[devices allKeys] sortedArrayUsingSelector:@selector(compare:)];
  NSMutableArray *ordered = [NSMutableArray new];
  for (NSString *key in keys) [ordered addObject:devices[key]];
  return @{@"currentId": currentId ?: (id)NSNull.null, @"devices": ordered};
}

- (NSDictionary *)snapshot {
  RTCAudioSession *rtc = RTCAudioSession.sharedInstance;
  [rtc lockForConfiguration];
  NSDictionary *value = [self snapshotLocked:rtc];
  [rtc unlockForConfiguration];
  return value;
}

- (void)publishSnapshot {
  if (!_invalidated && _hasListeners) {
    [self sendEventWithName:MiaoxunCallAudioRouteChanged body:[self snapshot]];
  }
}

RCT_REMAP_METHOD(getRoutes,
                 getRoutesWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject) {
  if (_invalidated) { reject(@"call_audio_route_unavailable", @"Audio routing is unavailable.", nil); return; }
  resolve([self snapshot]);
}

RCT_REMAP_METHOD(setRoute,
                 setRoute:(NSString *)identifier
                 resolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject) {
  if (_invalidated) { reject(@"call_audio_route_unavailable", @"Audio routing is unavailable.", nil); return; }
  RTCAudioSession *rtc = RTCAudioSession.sharedInstance;
  [rtc lockForConfiguration];
  NSDictionary *before = [self snapshotLocked:rtc];
  BOOL exists = NO;
  for (NSDictionary *device in before[@"devices"]) {
    if ([device[@"id"] isEqual:identifier]) { exists = YES; break; }
  }
  if (!exists || !rtc.isActive || ![rtc.category isEqualToString:AVAudioSessionCategoryPlayAndRecord]) {
    [rtc unlockForConfiguration];
    reject(@"call_audio_route_unavailable", @"This call audio device is no longer available.", nil);
    return;
  }
  if ([before[@"currentId"] isEqual:identifier]) {
    [rtc unlockForConfiguration];
    resolve(before);
    return;
  }
  AVAudioSessionPortDescription *selectedInput = nil;
  for (AVAudioSessionPortDescription *input in rtc.session.availableInputs) {
    if ([[self inputId:input] isEqual:identifier] ||
        (([identifier isEqualToString:@"earpiece"] || [identifier isEqualToString:@"speaker"]) &&
         [input.portType isEqualToString:AVAudioSessionPortBuiltInMic])) {
      selectedInput = input;
      break;
    }
  }
  BOOL speaker = [identifier isEqualToString:@"speaker"];
  if (!selectedInput && !speaker && !_wiredOutputs[identifier]) {
    [rtc unlockForConfiguration];
    reject(@"call_audio_route_unavailable", @"iOS cannot select this audio output directly.", nil);
    return;
  }
  NSError *error = nil;
  // Record ownership before the first setter. A failed second setter must still
  // allow clearRoute to undo the first one, including during bridge teardown.
  BOOL previouslyOwned = _ownsPreference;
  _ownsPreference = YES;
  BOOL changed = [rtc overrideOutputAudioPort:AVAudioSessionPortOverrideNone error:&error];
  if (!changed) _ownsPreference = previouslyOwned;
  if (changed) changed = [rtc setPreferredInput:selectedInput error:&error];
  if (changed && speaker) changed = [rtc overrideOutputAudioPort:AVAudioSessionPortOverrideSpeaker error:&error];
  NSDictionary *after = [self snapshotLocked:rtc];
  [rtc unlockForConfiguration];
  [self publishSnapshot];
  if (!changed) reject(@"call_audio_route_failed", @"Could not change the call audio device.", error);
  else resolve(after);
}

- (BOOL)clearPreference:(NSError **)error {
  if (!_ownsPreference) return YES;
  RTCAudioSession *rtc = RTCAudioSession.sharedInstance;
  [rtc lockForConfiguration];
  // A different category belongs to another audio feature now. Category changes
  // already remove the port override; do not reconfigure that feature's session.
  BOOL changed = YES;
  if ([rtc.category isEqualToString:AVAudioSessionCategoryPlayAndRecord]) {
    changed = [rtc overrideOutputAudioPort:AVAudioSessionPortOverrideNone error:error];
    NSError *inputError = nil;
    // AVAudioSession accepts nil to restore automatic input selection. The
    // RTCAudioSession proxy forwards it but its header omits nullable here.
    AVAudioSessionPortDescription *automaticInput = nil;
    BOOL inputCleared = [rtc setPreferredInput:automaticInput error:&inputError];
    if (!inputCleared && changed && error) *error = inputError;
    changed = changed && inputCleared;
  }
  if (changed) _ownsPreference = NO;
  [rtc unlockForConfiguration];
  return changed;
}

RCT_REMAP_METHOD(clearRoute,
                 clearRouteWithResolver:(RCTPromiseResolveBlock)resolve
                 rejecter:(RCTPromiseRejectBlock)reject) {
  NSError *error = nil;
  BOOL cleared = [self clearPreference:&error];
  [self publishSnapshot];
  if (cleared) resolve([self snapshot]);
  else reject(@"call_audio_route_failed", @"Could not clear the call audio preference.", error);
}

- (void)audioSessionDidChangeRoute:(RTCAudioSession *)session
                          reason:(AVAudioSessionRouteChangeReason)reason
                   previousRoute:(AVAudioSessionRouteDescription *)previousRoute {
  dispatch_async(_routeQueue, ^{
    if (self->_invalidated) return;
    if (reason == AVAudioSessionRouteChangeReasonOldDeviceUnavailable ||
        reason == AVAudioSessionRouteChangeReasonCategoryChange) {
      [self->_wiredOutputs removeAllObjects];
    }
    [self publishSnapshot];
  });
}

- (void)audioSessionMediaServerReset:(RTCAudioSession *)session {
  dispatch_async(_routeQueue, ^{
    if (self->_invalidated) return;
    [self->_wiredOutputs removeAllObjects];
    self->_ownsPreference = NO;
    [self publishSnapshot];
  });
}

- (void)audioSession:(RTCAudioSession *)session didSetActive:(BOOL)active {
  dispatch_async(_routeQueue, ^{ [self publishSnapshot]; });
}

- (void)invalidate {
  [[RTCAudioSession sharedInstance] removeDelegate:self];
  dispatch_async(_routeQueue, ^{
    self->_invalidated = YES;
    self->_hasListeners = NO;
    [self clearPreference:nil];
    [self->_wiredOutputs removeAllObjects];
  });
  [super invalidate];
}

@end
