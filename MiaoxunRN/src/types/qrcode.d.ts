declare module 'qrcode/lib/core/qrcode' {
  type QRCodeModuleData = {
    data: boolean[];
    size: number;
  };

  type QRCodeModel = {
    modules: QRCodeModuleData;
  };

  const QRCodeCore: {
    create: (
      value: string,
      options?: {
        errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
      },
    ) => QRCodeModel;
  };

  export default QRCodeCore;
}
