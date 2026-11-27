Pod::Spec.new do |s|
  s.name           = 'GoogleMaps3D'
  s.version        = '0.1.0'
  s.summary        = 'Google Maps 3D SDK flyover view for Offline Fitness (iOS stub).'
  s.description    = 'Android-only Google Maps 3D SDK native view; iOS provides a placeholder stub.'
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
