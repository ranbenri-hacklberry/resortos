import { registerRootComponent } from 'expo';
import { I18nManager } from 'react-native';
import App from './App';

I18nManager.allowRTL(true);
I18nManager.forceRTL(true);

registerRootComponent(App);
