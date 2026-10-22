Pod::Spec.new do |s|
  s.name           = 'GpsTracker'
  s.version        = '0.1.0'
  s.summary        = 'On-device GPS recording for Offline Fitness (iOS stub).'
  s.description    = 'Android-only recorder; the iOS target compiles a capability-reporting stub.'
  s.author         = 'Offline Fitness'
  s.homepage       = 'https://github.com/BrunoO/offline-fitness'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: 'https://github.com/BrunoO/offline-fitness.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = '**/*.{h,m,swift}'
end
