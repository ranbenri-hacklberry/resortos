import { I18nManager } from 'react-native';
import { registerRootComponent } from 'expo';
import App from './App';

I18nManager.allowRTL(true);
if (!I18nManager.isRTL) {
  I18nManager.forceRTL(true);
}

registerRootComponent(App);
