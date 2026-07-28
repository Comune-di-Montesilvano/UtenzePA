export class CoordinateHelper {

  static filterCoordinateInput(event: KeyboardEvent): void {
    if (!event.key) return;

    const input = event.target as HTMLInputElement;
    const currentValue = input?.value ?? '';
    const allowedKeys = ['Backspace', 'Tab', 'ArrowLeft', 'ArrowRight', 'Delete', 'Home', 'End'];

    if (allowedKeys.includes(event.key)) return;
    if ((event.ctrlKey || event.metaKey) && ['a', 'c', 'v', 'x'].includes(event.key.toLowerCase())) return;

    if (event.key === '-') {
      const selStart = input.selectionStart ?? 0;
      if (selStart === 0 && !currentValue.startsWith('-')) return;
      event.preventDefault();
      return;
    }

    if (event.key === '.') {
      if (!currentValue.includes('.')) return;
      event.preventDefault();
      return;
    }

    if (!event.key.match(/^\d$/)) {
      event.preventDefault();
    }
  }

  static validateRange(input: HTMLInputElement, min: number, max: number): void {
    const val = input?.value ?? '';
    if (val === '' || val === '-') return;
    const value = parseFloat(val);
    if (isNaN(value) || value < min || value > max) {
      input.value = '';
      input.dispatchEvent(new Event('input'));
    }
  }
}
