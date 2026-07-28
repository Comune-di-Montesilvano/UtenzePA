export class KeyboardHelper {
  static onlyNumbers(event: KeyboardEvent): void {
    if (!event.key) return;

    const allowedKeys = [
      'Backspace', 'Tab', 'ArrowLeft', 'ArrowRight', 'Delete', 'Home', 'End'
    ];

    if (allowedKeys.includes(event.key)) {
      return;
    }

    if ((event.ctrlKey || event.metaKey) && ['a', 'c', 'v', 'x'].includes(event.key.toLowerCase())) {
      return;
    }

    if (!event.key.match(/^\d$/)) {
      event.preventDefault();
    }
  }
}
