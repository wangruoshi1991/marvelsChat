import { Button } from "antd";

export function detailColumn(labelForRow, open) {
  return {
    title: "详情",
    key: "detail",
    render: (_, row) => (
      <Button
        size="small"
        aria-label={labelForRow(row)}
        aria-haspopup="dialog"
        onClick={(event) => {
          event.stopPropagation();
          open(row);
        }}
      >
        查看详情
      </Button>
    ),
  };
}
